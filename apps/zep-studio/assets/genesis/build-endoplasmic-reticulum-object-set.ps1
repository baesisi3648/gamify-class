$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;

public static class GenesisGifLzw
{
    private static void AddCode(List<byte> bytes, ref ulong buffer, ref int bitCount, int code)
    {
        buffer |= ((ulong)code << bitCount);
        bitCount += 9;
        while (bitCount >= 8)
        {
            bytes.Add((byte)(buffer & 0xff));
            buffer >>= 8;
            bitCount -= 8;
        }
    }

    public static byte[] Encode(byte[] indices)
    {
        const int clearCode = 256;
        const int endCode = 257;
        var bytes = new List<byte>(indices.Length * 3);
        ulong buffer = 0;
        int bitCount = 0;
        AddCode(bytes, ref buffer, ref bitCount, clearCode);
        for (int i = 0; i < indices.Length; i++)
        {
            AddCode(bytes, ref buffer, ref bitCount, indices[i]);
            if (i < indices.Length - 1)
                AddCode(bytes, ref buffer, ref bitCount, clearCode);
        }
        AddCode(bytes, ref buffer, ref bitCount, endCode);
        if (bitCount > 0)
            bytes.Add((byte)(buffer & 0xff));
        return bytes.ToArray();
    }
}
'@
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class GenesisGifQuantizer
{
    public static byte[] Quantize(Bitmap bitmap)
    {
        var rectangle = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        var data = bitmap.LockBits(rectangle, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try
        {
            int byteCount = Math.Abs(data.Stride) * bitmap.Height;
            var pixels = new byte[byteCount];
            Marshal.Copy(data.Scan0, pixels, 0, byteCount);
            var indices = new byte[bitmap.Width * bitmap.Height];
            for (int y = 0; y < bitmap.Height; y++)
            {
                int row = y * data.Stride;
                for (int x = 0; x < bitmap.Width; x++)
                {
                    int source = row + x * 4;
                    if (pixels[source + 3] < 32)
                    {
                        indices[y * bitmap.Width + x] = 0;
                        continue;
                    }
                    int blue = Math.Min(5, pixels[source] * 6 / 256);
                    int green = Math.Min(6, pixels[source + 1] * 7 / 256);
                    int red = Math.Min(5, pixels[source + 2] * 6 / 256);
                    indices[y * bitmap.Width + x] = (byte)(1 + ((red * 7 + green) * 6 + blue));
                }
            }
            return indices;
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }
}
'@ -ReferencedAssemblies System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$objects = Join-Path $root 'objects'
$frameWidth = 256
$frameHeight = 171
$frameCount = 6
$delayHundredths = 36

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
  Write-Output -NoEnumerate ([GenesisGifLzw]::Encode($indices))
}

function Set-HighQuality([System.Drawing.Graphics]$graphics) {
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
}

function Resize-StaticPng([string]$path) {
  $source = [System.Drawing.Bitmap]::new($path)
  try {
    if ($source.Width -le 1024 -and $source.Height -le 1024) { return }
    $scale = [Math]::Min(1024 / $source.Width, 1024 / $source.Height)
    $width = [Math]::Round($source.Width * $scale)
    $height = [Math]::Round($source.Height * $scale)
    $output = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($output)
      try {
        Set-HighQuality $graphics
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($source, 0, 0, $width, $height)
      } finally { $graphics.Dispose() }
      $temporary = "$path.normalized.png"
      $output.Save($temporary, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $output.Dispose() }
  } finally { $source.Dispose() }
  Move-Item -LiteralPath $temporary -Destination $path -Force
}

function Add-GlowDot([System.Drawing.Graphics]$graphics, [float]$x, [float]$y, [System.Drawing.Color]$color, [float]$radius) {
  $outer = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(80, $color.R, $color.G, $color.B))
  $inner = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(235, $color.R, $color.G, $color.B))
  $core = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245, 240, 255, 255))
  try {
    $graphics.FillEllipse($outer, $x - $radius * 1.8, $y - $radius * 1.8, $radius * 3.6, $radius * 3.6)
    $graphics.FillEllipse($inner, $x - $radius, $y - $radius, $radius * 2, $radius * 2)
    $graphics.FillEllipse($core, $x - $radius * .35, $y - $radius * .35, $radius * .7, $radius * .7)
  } finally {
    $outer.Dispose()
    $inner.Dispose()
    $core.Dispose()
  }
}

function Get-IndexedPixels([System.Drawing.Bitmap]$bitmap) {
  Write-Output -NoEnumerate ([GenesisGifQuantizer]::Quantize($bitmap))
}

function Get-FrameMaps([string]$sourcePath, [string]$kind) {
  $source = [System.Drawing.Bitmap]::new($sourcePath)
  $base = [System.Drawing.Bitmap]::new($frameWidth, $frameHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $baseGraphics = [System.Drawing.Graphics]::FromImage($base)
  Set-HighQuality $baseGraphics
  $baseGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $baseGraphics.Clear([System.Drawing.Color]::Transparent)
  $baseGraphics.DrawImage($source, 0, 0, $frameWidth, $frameHeight)
  $baseGraphics.Dispose()
  $source.Dispose()

  $maps = [System.Collections.Generic.List[byte[]]]::new()
  for ($frameIndex = 0; $frameIndex -lt $frameCount; $frameIndex++) {
    $frame = [System.Drawing.Bitmap]::new($frameWidth, $frameHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($frame)
    Set-HighQuality $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($base, 0, 0)

    if ($kind -eq 'rough') {
      $paths = @(
        @{ Start = 32; End = 223; Y = 49; Offset = 0 },
        @{ Start = 25; End = 200; Y = 88; Offset = 2 },
        @{ Start = 64; End = 220; Y = 122; Offset = 4 }
      )
      foreach ($path in $paths) {
        $progress = (($frameIndex + $path.Offset) % $frameCount) / $frameCount
        $x = $path.Start + ($path.End - $path.Start) * $progress
        $y = $path.Y + [Math]::Sin(($frameIndex + $path.Offset) * [Math]::PI / 3) * 3
        Add-GlowDot $graphics $x $y ([System.Drawing.Color]::FromArgb(255, 240, 55, 255)) 3.5
      }
      $ringAlpha = 75 + [int](55 * (1 + [Math]::Sin($frameIndex * [Math]::PI / 3)) / 2)
      $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb($ringAlpha, 90, 235, 255), 2)
      try { $graphics.DrawEllipse($pen, 164, 84, 32, 32) } finally { $pen.Dispose() }
    } else {
      $calciumColor = [System.Drawing.Color]::FromArgb(255, 160, 250, 255)
      $tanks = @(
        @{ X = 128; BaseY = 97; Offset = 0 },
        @{ X = 48; BaseY = 117; Offset = 1 },
        @{ X = 208; BaseY = 117; Offset = 3 },
        @{ X = 84; BaseY = 72; Offset = 4 },
        @{ X = 173; BaseY = 72; Offset = 2 }
      )
      foreach ($tank in $tanks) {
        $phase = ($frameIndex + $tank.Offset) % $frameCount
        $y = $tank.BaseY - $phase * 4
        Add-GlowDot $graphics $tank.X $y $calciumColor 3
      }
      $pulse = 3 + 1.5 * [Math]::Sin($frameIndex * [Math]::PI / 3)
      $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(125, 80, 245, 255), $pulse)
      try { $graphics.DrawEllipse($pen, 108, 29, 40, 20) } finally { $pen.Dispose() }
    }

    $graphics.Dispose()
    $indices = Get-IndexedPixels $frame
    $maps.Add($indices)
    $frame.Dispose()
  }
  $base.Dispose()
  Write-Output -NoEnumerate $maps
}

function Write-AnimatedGif([string]$sourcePath, [string]$outputPath, [string]$kind) {
  $frameMaps = Get-FrameMaps $sourcePath $kind
  $stream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::Create)
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([Text.Encoding]::ASCII.GetBytes('GIF89a'))
    Write-UInt16LE $writer $frameWidth
    Write-UInt16LE $writer $frameHeight
    $writer.Write([byte]0xf7)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
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
    $writer.Write([byte[]](0x21, 0xff, 0x0b))
    $writer.Write([Text.Encoding]::ASCII.GetBytes('NETSCAPE2.0'))
    $writer.Write([byte[]](0x03, 0x01, 0x00, 0x00, 0x00))

    foreach ($indices in $frameMaps) {
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
    $writer.Dispose()
    $stream.Dispose()
  }
}

$roughPng = Join-Path $objects 'rough-er-protein-processing-system.png'
$smoothPng = Join-Path $objects 'smooth-er-calcium-reservoir.png'
$roughGif = Join-Path $objects 'rough-er-protein-processing-system-loop.gif'
$smoothGif = Join-Path $objects 'smooth-er-calcium-reservoir-loop.gif'
$readme = Join-Path $objects 'endoplasmic-reticulum-object-set-README.md'
$zip = Join-Path $objects 'endoplasmic-reticulum-room-object-set.zip'

Resize-StaticPng $roughPng
Resize-StaticPng $smoothPng
Write-AnimatedGif $roughPng $roughGif 'rough'
Write-AnimatedGif $smoothPng $smoothGif 'smooth'
Compress-Archive -LiteralPath @($roughPng, $roughGif, $smoothPng, $smoothGif, $readme) -DestinationPath $zip -Force

Write-Output "Created $roughGif"
Write-Output "Created $smoothGif"
Write-Output "Created $zip"
