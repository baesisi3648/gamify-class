$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $root 'objects\dormant-nuclear-loader-robot.png'
$outputPath = Join-Path $root 'objects\dormant-nuclear-loader-robot-grounded.png'
$source = [System.Drawing.Bitmap]::new($sourcePath)
$output = [System.Drawing.Bitmap]::new($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

try {
  $graphics = [System.Drawing.Graphics]::FromImage($output)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    # Layered translucent ellipses form a soft ZEP-style contact shadow without a hard edge.
    $shadowLayers = @(
      @{ X = 202; Y = 584; Width = 620; Height = 88; Alpha = 12 },
      @{ X = 232; Y = 594; Width = 560; Height = 70; Alpha = 16 },
      @{ X = 272; Y = 604; Width = 480; Height = 52; Alpha = 20 },
      @{ X = 322; Y = 614; Width = 380; Height = 32; Alpha = 24 }
    )
    foreach ($layer in $shadowLayers) {
      $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($layer.Alpha, 8, 13, 18))
      try {
        $graphics.FillEllipse($brush, $layer.X, $layer.Y, $layer.Width, $layer.Height)
      } finally {
        $brush.Dispose()
      }
    }

    $graphics.DrawImage($source, 0, 0, $source.Width, $source.Height)
  } finally {
    $graphics.Dispose()
  }
  $output.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $output.Dispose()
  $source.Dispose()
}

Write-Output "Created $outputPath"
