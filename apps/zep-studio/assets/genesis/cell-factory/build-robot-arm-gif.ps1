$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $root 'weathered-biolab-app\ribosome-robot-arm-animated.png'
$outputPath = Join-Path $root 'ribosome-robot-arm-slow-loop.gif'

$frameWidth = 80
$frameHeight = 160
$delayHundredths = 45
$sequence = @(0, 1, 2, 3, 4, 5, 4, 3, 2, 1)

function Write-UInt16LE([System.IO.BinaryWriter]$writer, [int]$value) {
  $writer.Write([byte]($value -band 0xff))
  $writer.Write([byte](($value -shr 8) -band 0xff))
}

function Get-PaletteIndex([System.Drawing.Color]$color) {
  if ($color.A -lt 32) { return [byte]0 }
  $r = [Math]::Min(5, [int]($color.R * 6 / 256))
  $g = [Math]::Min(6, [int]($color.G * 7 / 256))
  $b = [Math]::Min(5, [int]($color.B * 6 / 256))
  return [byte](1 + (($r * 7 + $g) * 6 + $b))
}

function Add-PackedCode([System.Collections.Generic.List[byte]]$bytes, [ref]$buffer, [ref]$bitCount, [int]$code, [int]$codeSize) {
  $buffer.Value = $buffer.Value -bor ([uint64]$code -shl $bitCount.Value)
  $bitCount.Value += $codeSize
  while ($bitCount.Value -ge 8) {
    $bytes.Add([byte]($buffer.Value -band 0xff))
    $buffer.Value = $buffer.Value -shr 8
    $bitCount.Value -= 8
  }
}

function Get-LzwBytes([byte[]]$indices) {
  $minimumCodeSize = 8
  $clearCode = 1 -shl $minimumCodeSize
  $endCode = $clearCode + 1
  $codeSize = $minimumCodeSize + 1
  $bytes = [System.Collections.Generic.List[byte]]::new()
  [uint64]$buffer = 0
  [int]$bitCount = 0

  Add-PackedCode $bytes ([ref]$buffer) ([ref]$bitCount) $clearCode $codeSize
  for ($i = 0; $i -lt $indices.Length; $i++) {
    Add-PackedCode $bytes ([ref]$buffer) ([ref]$bitCount) ([int]$indices[$i]) $codeSize
    if ($i -lt $indices.Length - 1) {
      # Reset after every pixel. This is intentionally less compressed but maximally compatible,
      # and the resulting ZEP object still stays far below the 3 MB upload limit.
      Add-PackedCode $bytes ([ref]$buffer) ([ref]$bitCount) $clearCode $codeSize
    }
  }
  Add-PackedCode $bytes ([ref]$buffer) ([ref]$bitCount) $endCode $codeSize
  if ($bitCount -gt 0) { $bytes.Add([byte]($buffer -band 0xff)) }
  return $bytes.ToArray()
}

$source = [System.Drawing.Bitmap]::new($sourcePath)
$stream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::Create)
$writer = [System.IO.BinaryWriter]::new($stream)

try {
  $writer.Write([Text.Encoding]::ASCII.GetBytes('GIF89a'))
  Write-UInt16LE $writer $frameWidth
  Write-UInt16LE $writer $frameHeight
  $writer.Write([byte]0xf7)
  $writer.Write([byte]0)
  $writer.Write([byte]0)

  # Global palette: index 0 is transparent, indices 1-252 use a 6×7×6 RGB cube.
  $writer.Write([byte[]](0, 0, 0))
  for ($r = 0; $r -lt 6; $r++) {
    for ($g = 0; $g -lt 7; $g++) {
      for ($b = 0; $b -lt 6; $b++) {
        $writer.Write([byte][Math]::Round($r * 255 / 5))
        $writer.Write([byte][Math]::Round($g * 255 / 6))
        $writer.Write([byte][Math]::Round($b * 255 / 5))
      }
    }
  }
  for ($i = 253; $i -lt 256; $i++) { $writer.Write([byte[]](0, 0, 0)) }

  # NETSCAPE loop extension: 0 means repeat forever.
  $writer.Write([byte[]](0x21, 0xff, 0x0b))
  $writer.Write([Text.Encoding]::ASCII.GetBytes('NETSCAPE2.0'))
  $writer.Write([byte[]](0x03, 0x01, 0x00, 0x00, 0x00))

  foreach ($frameIndex in $sequence) {
    $indices = [byte[]]::new($frameWidth * $frameHeight)
    $offsetX = $frameIndex * $frameWidth
    $cursor = 0
    for ($y = 0; $y -lt $frameHeight; $y++) {
      for ($x = 0; $x -lt $frameWidth; $x++) {
        $indices[$cursor++] = Get-PaletteIndex $source.GetPixel($offsetX + $x, $y)
      }
    }

    $writer.Write([byte[]](0x21, 0xf9, 0x04, 0x09))
    Write-UInt16LE $writer $delayHundredths
    $writer.Write([byte[]](0x00, 0x00))

    $writer.Write([byte]0x2c)
    Write-UInt16LE $writer 0
    Write-UInt16LE $writer 0
    Write-UInt16LE $writer $frameWidth
    Write-UInt16LE $writer $frameHeight
    $writer.Write([byte]0x00)
    $writer.Write([byte]0x08)

    $compressed = Get-LzwBytes $indices
    for ($offset = 0; $offset -lt $compressed.Length; $offset += 255) {
      $length = [Math]::Min(255, $compressed.Length - $offset)
      $writer.Write([byte]$length)
      $writer.Write($compressed, $offset, $length)
    }
    $writer.Write([byte]0x00)
  }

  $writer.Write([byte]0x3b)
} finally {
  $source.Dispose()
  $writer.Dispose()
  $stream.Dispose()
}

Write-Output "Created $outputPath"
