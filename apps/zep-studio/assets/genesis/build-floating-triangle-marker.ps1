$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class FloatingMarkerGifTools
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
$pngPath = Join-Path $objects 'floating-white-triangle-marker.png'
$gifPath = Join-Path $objects 'floating-white-triangle-marker-loop.gif'
$frameWidth = 96
$frameHeight = 128
$frameCount = 12
$delayHundredths = 10

function Write-UInt16LE([System.IO.BinaryWriter]$writer, [int]$value) {
  $writer.Write([byte]($value -band 0xff))
  $writer.Write([byte](($value -shr 8) -band 0xff))
}

function Set-HighQuality([System.Drawing.Graphics]$graphics) {
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
}

function Add-SmoothShadow([System.Drawing.Graphics]$graphics, [float]$closeness) {
  $width = 27 + 9 * $closeness
  $height = 7 + 3 * $closeness
  $alpha = 40 + [int](35 * $closeness)
  $layers = @(
    @{ Scale = 1.35; Alpha = [int]($alpha * .18) },
    @{ Scale = 1.12; Alpha = [int]($alpha * .32) },
    @{ Scale = .90; Alpha = [int]($alpha * .52) },
    @{ Scale = .62; Alpha = [int]($alpha * .72) }
  )
  foreach ($layer in $layers) {
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($layer.Alpha, 18, 25, 34))
    try {
      $w = $width * $layer.Scale; $h = $height * $layer.Scale
      $graphics.FillEllipse($brush, 48 - $w / 2, 108 - $h / 2, $w, $h)
    } finally { $brush.Dispose() }
  }
}

function Add-DitheredShadow([System.Drawing.Graphics]$graphics, [float]$closeness, [int]$frameIndex) {
  $radiusX = 15 + 4 * $closeness
  $radiusY = 4 + 1.5 * $closeness
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 35, 42, 52))
  try {
    for ($y = 101; $y -le 114; $y++) {
      for ($x = 24; $x -le 72; $x++) {
        $dx = ($x - 48) / $radiusX; $dy = ($y - 108) / $radiusY
        $distance = $dx * $dx + $dy * $dy
        if ($distance -gt 1) { continue }
        $density = (1 - $distance) * (.42 + .28 * $closeness)
        $pattern = (($x * 3 + $y * 5 + $frameIndex) % 11) / 10
        if ($pattern -lt $density) { $graphics.FillRectangle($brush, $x, $y, 1, 1) }
      }
    }
  } finally { $brush.Dispose() }
}

function Add-TriangleMarker([System.Drawing.Graphics]$graphics, [float]$topY) {
  $outline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(235, 90, 102, 116), 1.4)
  $topBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
  $frontBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 245, 248, 252))
  $sideBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 181, 191, 205))
  $highlight = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(225, 255, 255, 255), 2.2)
  try {
    $back = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new(29, $topY),
      [System.Drawing.PointF]::new(73, $topY),
      [System.Drawing.PointF]::new(51, $topY + 42)
    )
    $front = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new(23, $topY + 6),
      [System.Drawing.PointF]::new(67, $topY + 6),
      [System.Drawing.PointF]::new(45, $topY + 48)
    )
    $topFace = [System.Drawing.PointF[]]@($back[0], $back[1], $front[1], $front[0])
    $rightFace = [System.Drawing.PointF[]]@($back[1], $back[2], $front[2], $front[1])
    $graphics.FillPolygon($topBrush, $topFace)
    $graphics.FillPolygon($sideBrush, $rightFace)
    $graphics.FillPolygon($frontBrush, $front)
    $graphics.DrawPolygon($outline, $back)
    $graphics.DrawPolygon($outline, $front)
    $graphics.DrawLine($outline, $back[0], $front[0])
    $graphics.DrawLine($outline, $back[1], $front[1])
    $graphics.DrawLine($outline, $back[2], $front[2])
    $graphics.DrawLine($highlight, 28, $topY + 9, 44, $topY + 39)
  } finally {
    $outline.Dispose(); $topBrush.Dispose(); $frontBrush.Dispose(); $sideBrush.Dispose(); $highlight.Dispose()
  }
}

function New-MarkerFrame([int]$frameIndex, [bool]$smoothShadow) {
  $phase = $frameIndex / $frameCount * [Math]::PI * 2
  $bob = [Math]::Sin($phase)
  $topY = 24 + 7 * $bob
  $closeness = ($bob + 1) / 2
  $bitmap = [System.Drawing.Bitmap]::new($frameWidth, $frameHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  Set-HighQuality $graphics
  $graphics.Clear([System.Drawing.Color]::Transparent)
  if ($smoothShadow) { Add-SmoothShadow $graphics $closeness } else { Add-DitheredShadow $graphics $closeness $frameIndex }
  Add-TriangleMarker $graphics $topY
  $graphics.Dispose()
  return $bitmap
}

function Write-AnimatedGif([string]$outputPath) {
  $stream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::Create)
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([Text.Encoding]::ASCII.GetBytes('GIF89a'))
    Write-UInt16LE $writer $frameWidth; Write-UInt16LE $writer $frameHeight
    $writer.Write([byte]0xf7); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([byte[]](0, 0, 0))
    for ($r = 0; $r -lt 6; $r++) { for ($g = 0; $g -lt 7; $g++) { for ($b = 0; $b -lt 6; $b++) {
      $writer.Write([byte][Math]::Round($r * 255 / 5)); $writer.Write([byte][Math]::Round($g * 255 / 6)); $writer.Write([byte][Math]::Round($b * 255 / 5))
    } } }
    for ($i = 253; $i -lt 256; $i++) { $writer.Write([byte[]](0, 0, 0)) }
    $writer.Write([byte[]](0x21, 0xff, 0x0b)); $writer.Write([Text.Encoding]::ASCII.GetBytes('NETSCAPE2.0')); $writer.Write([byte[]](0x03, 0x01, 0x00, 0x00, 0x00))
    for ($frameIndex = 0; $frameIndex -lt $frameCount; $frameIndex++) {
      $frame = New-MarkerFrame $frameIndex $false
      try { $indices = [FloatingMarkerGifTools]::Quantize($frame) } finally { $frame.Dispose() }
      $writer.Write([byte[]](0x21, 0xf9, 0x04, 0x09)); Write-UInt16LE $writer $delayHundredths; $writer.Write([byte[]](0x00, 0x00))
      $writer.Write([byte]0x2c); Write-UInt16LE $writer 0; Write-UInt16LE $writer 0; Write-UInt16LE $writer $frameWidth; Write-UInt16LE $writer $frameHeight
      $writer.Write([byte]0x00); $writer.Write([byte]0x08)
      $compressed = [FloatingMarkerGifTools]::Encode($indices)
      for ($offset = 0; $offset -lt $compressed.Length; $offset += 255) {
        $length = [Math]::Min(255, $compressed.Length - $offset); $writer.Write([byte]$length); $writer.Write($compressed, $offset, $length)
      }
      $writer.Write([byte]0x00)
    }
    $writer.Write([byte]0x3b)
  } finally { $writer.Dispose(); $stream.Dispose() }
}

$preview = New-MarkerFrame 0 $true
try { $preview.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $preview.Dispose() }
Write-AnimatedGif $gifPath
Write-Output "Created $pngPath"
Write-Output "Created $gifPath"
