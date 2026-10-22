$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class NucleusGifTools
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
                    if (pixels[source + 3] < 32) { indices[y * bitmap.Width + x] = 0; continue; }
                    int blue = Math.Min(5, pixels[source] * 6 / 256);
                    int green = Math.Min(6, pixels[source + 1] * 7 / 256);
                    int red = Math.Min(5, pixels[source + 2] * 6 / 256);
                    indices[y * bitmap.Width + x] = (byte)(1 + ((red * 7 + green) * 6 + blue));
                }
            }
            return indices;
        }
        finally { bitmap.UnlockBits(data); }
    }

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
            if (i < indices.Length - 1) AddCode(bytes, ref buffer, ref bitCount, clearCode);
        }
        AddCode(bytes, ref buffer, ref bitCount, endCode);
        if (bitCount > 0) bytes.Add((byte)(buffer & 0xff));
        return bytes.ToArray();
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

function Set-HighQuality([System.Drawing.Graphics]$graphics) {
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
}

function Add-GlowDot([System.Drawing.Graphics]$graphics, [float]$x, [float]$y, [System.Drawing.Color]$color, [float]$radius) {
  $outer = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(75, $color.R, $color.G, $color.B))
  $inner = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(235, $color.R, $color.G, $color.B))
  $core = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245, 245, 255, 255))
  try {
    $graphics.FillEllipse($outer, $x - $radius * 1.8, $y - $radius * 1.8, $radius * 3.6, $radius * 3.6)
    $graphics.FillEllipse($inner, $x - $radius, $y - $radius, $radius * 2, $radius * 2)
    $graphics.FillEllipse($core, $x - $radius * .35, $y - $radius * .35, $radius * .7, $radius * .7)
  } finally { $outer.Dispose(); $inner.Dispose(); $core.Dispose() }
}

function Add-PulseRing([System.Drawing.Graphics]$graphics, [float]$x, [float]$y, [float]$width, [float]$height, [int]$frameIndex, [System.Drawing.Color]$color) {
  $alpha = 75 + [int](70 * (1 + [Math]::Sin($frameIndex * [Math]::PI / 3)) / 2)
  $thickness = 1.5 + (1 + [Math]::Sin($frameIndex * [Math]::PI / 3))
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B), $thickness)
  try { $graphics.DrawEllipse($pen, $x, $y, $width, $height) } finally { $pen.Dispose() }
}

function Add-Animation([System.Drawing.Graphics]$graphics, [string]$kind, [int]$frameIndex) {
  $cyan = [System.Drawing.Color]::FromArgb(255, 65, 235, 255)
  $purple = [System.Drawing.Color]::FromArgb(255, 230, 60, 255)

  switch ($kind) {
    'nucleus' {
      Add-PulseRing $graphics 103 35 50 50 $frameIndex $cyan
      for ($i = 0; $i -lt 3; $i++) {
        $angle = (($frameIndex + $i * 2) / $frameCount) * [Math]::PI * 2
        Add-GlowDot $graphics (128 + [Math]::Cos($angle) * 18) (61 + [Math]::Sin($angle) * 25) $cyan 2.8
      }
    }
    'archive' {
      $tubes = @(@{ X = 73; Offset = 0 }, @{ X = 128; Offset = 2 }, @{ X = 184; Offset = 4 })
      foreach ($tube in $tubes) {
        $phase = ($frameIndex + $tube.Offset) % $frameCount
        Add-GlowDot $graphics $tube.X (99 - $phase * 9) $purple 3.2
      }
    }
    'nucleolus' {
      Add-PulseRing $graphics 103 28 50 42 $frameIndex $purple
      $ends = @(@{ X = 72; Y = 127; Offset = 0 }, @{ X = 128; Y = 145; Offset = 2 }, @{ X = 190; Y = 127; Offset = 4 })
      foreach ($end in $ends) {
        $progress = (($frameIndex + $end.Offset) % $frameCount) / ($frameCount - 1)
        Add-GlowDot $graphics (128 + ($end.X - 128) * $progress) (72 + ($end.Y - 72) * $progress) $purple 3.2
      }
    }
    'pore' {
      Add-PulseRing $graphics 91 26 74 82 $frameIndex $cyan
      for ($i = 0; $i -lt 4; $i++) {
        $angle = (($frameIndex + $i * 1.5) / $frameCount) * [Math]::PI * 2
        Add-GlowDot $graphics (128 + [Math]::Cos($angle) * 34) (66 + [Math]::Sin($angle) * 37) $purple 2.8
      }
    }
    'chromatin' {
      $reels = @(
        @{ X = 74; Y = 58; Offset = 0 }, @{ X = 108; Y = 67; Offset = 1 },
        @{ X = 147; Y = 76; Offset = 3 }, @{ X = 188; Y = 86; Offset = 4 }
      )
      foreach ($reel in $reels) {
        $phase = ($frameIndex + $reel.Offset) % $frameCount
        $x = $reel.X - 9 + $phase * 3.5
        Add-GlowDot $graphics $x $reel.Y $cyan 2.8
      }
    }
  }
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
    Add-Animation $graphics $kind $frameIndex
    $graphics.Dispose()
    $maps.Add([NucleusGifTools]::Quantize($frame))
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
    $writer.Write([byte]0xf7); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([byte[]](0, 0, 0))
    for ($r = 0; $r -lt 6; $r++) { for ($g = 0; $g -lt 7; $g++) { for ($b = 0; $b -lt 6; $b++) {
      $writer.Write([byte][Math]::Round($r * 255 / 5)); $writer.Write([byte][Math]::Round($g * 255 / 6)); $writer.Write([byte][Math]::Round($b * 255 / 5))
    } } }
    for ($i = 253; $i -lt 256; $i++) { $writer.Write([byte[]](0, 0, 0)) }
    $writer.Write([byte[]](0x21, 0xff, 0x0b)); $writer.Write([Text.Encoding]::ASCII.GetBytes('NETSCAPE2.0')); $writer.Write([byte[]](0x03, 0x01, 0x00, 0x00, 0x00))
    foreach ($indices in $frameMaps) {
      $writer.Write([byte[]](0x21, 0xf9, 0x04, 0x09)); Write-UInt16LE $writer $delayHundredths; $writer.Write([byte[]](0x00, 0x00))
      $writer.Write([byte]0x2c); Write-UInt16LE $writer 0; Write-UInt16LE $writer 0; Write-UInt16LE $writer $frameWidth; Write-UInt16LE $writer $frameHeight
      $writer.Write([byte]0x00); $writer.Write([byte]0x08)
      $compressed = [NucleusGifTools]::Encode($indices)
      for ($offset = 0; $offset -lt $compressed.Length; $offset += 255) {
        $length = [Math]::Min(255, $compressed.Length - $offset); $writer.Write([byte]$length); $writer.Write($compressed, $offset, $length)
      }
      $writer.Write([byte]0x00)
    }
    $writer.Write([byte]0x3b)
  } finally { $writer.Dispose(); $stream.Dispose() }
}

$definitions = @(
  @{ Source = 'nucleus-command-core.png'; Output = 'nucleus-command-core-loop.gif'; Kind = 'nucleus' },
  @{ Source = 'dna-genomic-data-archive.png'; Output = 'dna-genomic-data-archive-loop.gif'; Kind = 'archive' },
  @{ Source = 'nucleolus-fabrication-core.png'; Output = 'nucleolus-fabrication-core-loop.gif'; Kind = 'nucleolus' },
  @{ Source = 'nuclear-pore-gateway.png'; Output = 'nuclear-pore-gateway-loop.gif'; Kind = 'pore' },
  @{ Source = 'chromatin-data-spool-rack.png'; Output = 'chromatin-data-spool-rack-loop.gif'; Kind = 'chromatin' }
)

$outputs = [System.Collections.Generic.List[string]]::new()
foreach ($definition in $definitions) {
  $sourcePath = Join-Path $objects $definition.Source
  $outputPath = Join-Path $objects $definition.Output
  Write-AnimatedGif $sourcePath $outputPath $definition.Kind
  $outputs.Add($outputPath)
  Write-Output "Created $outputPath"
}

$readme = Join-Path $objects 'nucleus-room-gif-set-README.md'
$outputs.Add($readme)
$zip = Join-Path $objects 'nucleus-room-animated-object-set.zip'
Compress-Archive -LiteralPath $outputs.ToArray() -DestinationPath $zip -Force
Write-Output "Created $zip"
