$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class CytoskeletonGifTools
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
                    if (pixels[source + 3] < 24) { indices[y * bitmap.Width + x] = 0; continue; }
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
        buffer |= ((ulong)code << bitCount); bitCount += 9;
        while (bitCount >= 8) { bytes.Add((byte)(buffer & 0xff)); buffer >>= 8; bitCount -= 8; }
    }

    public static byte[] Encode(byte[] indices)
    {
        const int clearCode = 256; const int endCode = 257;
        var bytes = new List<byte>(indices.Length * 3); ulong buffer = 0; int bitCount = 0;
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
  $writer.Write([byte]($value -band 0xff)); $writer.Write([byte](($value -shr 8) -band 0xff))
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
    $width = [Math]::Round($source.Width * $scale); $height = [Math]::Round($source.Height * $scale)
    $output = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($output)
      try {
        Set-HighQuality $graphics; $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.Clear([System.Drawing.Color]::Transparent); $graphics.DrawImage($source, 0, 0, $width, $height)
      } finally { $graphics.Dispose() }
      $temporary = "$path.normalized.png"; $output.Save($temporary, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $output.Dispose() }
  } finally { $source.Dispose() }
  Move-Item -LiteralPath $temporary -Destination $path -Force
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
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B), 2.5)
  try { $graphics.DrawEllipse($pen, $x, $y, $width, $height) } finally { $pen.Dispose() }
}

function Add-Animation([System.Drawing.Graphics]$graphics, [string]$kind, [int]$frameIndex) {
  $cyan = [System.Drawing.Color]::FromArgb(255, 65, 235, 255)
  $purple = [System.Drawing.Color]::FromArgb(255, 235, 55, 255)
  $gold = [System.Drawing.Color]::FromArgb(255, 255, 170, 35)

  switch ($kind) {
    'microtubule' {
      $tracks = @(
        @{ StartX = 45; StartY = 138; EndX = 214; EndY = 47; Offset = 0; Color = $purple },
        @{ StartX = 55; StartY = 151; EndX = 224; EndY = 61; Offset = 2; Color = $gold },
        @{ StartX = 39; StartY = 123; EndX = 205; EndY = 34; Offset = 4; Color = $cyan }
      )
      foreach ($track in $tracks) {
        $progress = (($frameIndex + $track.Offset) % $frameCount) / ($frameCount - 1)
        Add-GlowDot $graphics ($track.StartX + ($track.EndX - $track.StartX) * $progress) ($track.StartY + ($track.EndY - $track.StartY) * $progress) $track.Color 3.4
      }
      Add-PulseRing $graphics 28 105 34 34 $frameIndex $cyan
    }
    'actin' {
      $phase = (1 + [Math]::Sin($frameIndex * [Math]::PI / 3)) / 2
      Add-PulseRing $graphics 103 57 51 48 $frameIndex $purple
      Add-GlowDot $graphics (54 + 58 * $phase) 76 $purple 3
      Add-GlowDot $graphics (202 - 58 * $phase) 94 $purple 3
      Add-GlowDot $graphics (62 + 52 * $phase) 111 $gold 2.8
      Add-GlowDot $graphics (194 - 52 * $phase) 124 $gold 2.8
    }
    'intermediate' {
      Add-PulseRing $graphics 105 40 48 68 $frameIndex $cyan
      $anchors = @(
        @{ X = 54; Y = 67; Offset = 0 }, @{ X = 202; Y = 67; Offset = 2 },
        @{ X = 68; Y = 133; Offset = 4 }, @{ X = 188; Y = 133; Offset = 1 }
      )
      foreach ($anchor in $anchors) {
        $pulse = (($frameIndex + $anchor.Offset) % $frameCount) / ($frameCount - 1)
        $color = if ($pulse -lt .5) { $cyan } else { $gold }
        Add-GlowDot $graphics $anchor.X $anchor.Y $color (2.6 + $pulse)
      }
    }
  }
}

function Get-FrameMaps([string]$sourcePath, [string]$kind) {
  $source = [System.Drawing.Bitmap]::new($sourcePath)
  $base = [System.Drawing.Bitmap]::new($frameWidth, $frameHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $baseGraphics = [System.Drawing.Graphics]::FromImage($base); Set-HighQuality $baseGraphics
  $baseGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $baseGraphics.Clear([System.Drawing.Color]::Transparent); $baseGraphics.DrawImage($source, 0, 0, $frameWidth, $frameHeight)
  $baseGraphics.Dispose(); $source.Dispose()
  $maps = [System.Collections.Generic.List[byte[]]]::new()
  for ($frameIndex = 0; $frameIndex -lt $frameCount; $frameIndex++) {
    $frame = [System.Drawing.Bitmap]::new($frameWidth, $frameHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($frame); Set-HighQuality $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent); $graphics.DrawImage($base, 0, 0)
    Add-Animation $graphics $kind $frameIndex; $graphics.Dispose()
    $maps.Add([CytoskeletonGifTools]::Quantize($frame)); $frame.Dispose()
  }
  $base.Dispose(); Write-Output -NoEnumerate $maps
}

function Write-AnimatedGif([string]$sourcePath, [string]$outputPath, [string]$kind) {
  $frameMaps = Get-FrameMaps $sourcePath $kind
  $stream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::Create); $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([Text.Encoding]::ASCII.GetBytes('GIF89a')); Write-UInt16LE $writer $frameWidth; Write-UInt16LE $writer $frameHeight
    $writer.Write([byte]0xf7); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte[]](0, 0, 0))
    for ($r = 0; $r -lt 6; $r++) { for ($g = 0; $g -lt 7; $g++) { for ($b = 0; $b -lt 6; $b++) {
      $writer.Write([byte][Math]::Round($r * 255 / 5)); $writer.Write([byte][Math]::Round($g * 255 / 6)); $writer.Write([byte][Math]::Round($b * 255 / 5))
    } } }
    for ($i = 253; $i -lt 256; $i++) { $writer.Write([byte[]](0, 0, 0)) }
    $writer.Write([byte[]](0x21, 0xff, 0x0b)); $writer.Write([Text.Encoding]::ASCII.GetBytes('NETSCAPE2.0')); $writer.Write([byte[]](0x03, 0x01, 0x00, 0x00, 0x00))
    foreach ($indices in $frameMaps) {
      $writer.Write([byte[]](0x21, 0xf9, 0x04, 0x09)); Write-UInt16LE $writer $delayHundredths; $writer.Write([byte[]](0x00, 0x00))
      $writer.Write([byte]0x2c); Write-UInt16LE $writer 0; Write-UInt16LE $writer 0; Write-UInt16LE $writer $frameWidth; Write-UInt16LE $writer $frameHeight
      $writer.Write([byte]0x00); $writer.Write([byte]0x08); $compressed = [CytoskeletonGifTools]::Encode($indices)
      for ($offset = 0; $offset -lt $compressed.Length; $offset += 255) {
        $length = [Math]::Min(255, $compressed.Length - $offset); $writer.Write([byte]$length); $writer.Write($compressed, $offset, $length)
      }
      $writer.Write([byte]0x00)
    }
    $writer.Write([byte]0x3b)
  } finally { $writer.Dispose(); $stream.Dispose() }
}

$definitions = @(
  @{ Base = 'cytoskeleton-microtubule-cargo-highway'; Kind = 'microtubule' },
  @{ Base = 'cytoskeleton-actin-contraction-rig'; Kind = 'actin' },
  @{ Base = 'cytoskeleton-intermediate-filament-scaffold'; Kind = 'intermediate' }
)
$packageFiles = [System.Collections.Generic.List[string]]::new()
foreach ($definition in $definitions) {
  $png = Join-Path $objects "$($definition.Base).png"; $gif = Join-Path $objects "$($definition.Base)-loop.gif"
  Resize-StaticPng $png; Write-AnimatedGif $png $gif $definition.Kind
  $packageFiles.Add($png); $packageFiles.Add($gif); Write-Output "Created $gif"
}
$readme = Join-Path $objects 'cytoskeleton-room-object-set-README.md'; $packageFiles.Add($readme)
$zip = Join-Path $objects 'cytoskeleton-room-object-set.zip'
Compress-Archive -LiteralPath $packageFiles.ToArray() -DestinationPath $zip -Force
Write-Output "Created $zip"
