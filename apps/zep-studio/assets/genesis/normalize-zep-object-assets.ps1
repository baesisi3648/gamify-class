$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$maximumEdge = 1024
$cellFactoryNames = @(
  'ribosome-epa-assembly-station.png',
  'trna-amino-acid-carrier.png',
  'ribosome-robot-arm.png',
  'ribosome-conveyor-straight.png',
  'ribosome-conveyor-curve.png',
  'amino-acid-cargo-pod.png'
)

$targets = [System.Collections.Generic.List[string]]::new()
Get-ChildItem (Join-Path $root 'objects') -File -Filter '*.png' |
  ForEach-Object { $targets.Add($_.FullName) }
Get-ChildItem (Join-Path $root 'story-panels') -File -Filter '*.png' |
  ForEach-Object { $targets.Add($_.FullName) }
foreach ($name in $cellFactoryNames) {
  $targets.Add((Join-Path $root "cell-factory\$name"))
}

foreach ($path in $targets) {
  $source = [System.Drawing.Bitmap]::new($path)
  try {
    if ($source.Width -le $maximumEdge -and $source.Height -le $maximumEdge) {
      Write-Output "OK      $([IO.Path]::GetFileName($path)) $($source.Width)x$($source.Height)"
      continue
    }

    $scale = [Math]::Min($maximumEdge / $source.Width, $maximumEdge / $source.Height)
    $width = [Math]::Max(1, [Math]::Round($source.Width * $scale))
    $height = [Math]::Max(1, [Math]::Round($source.Height * $scale))
    $output = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($output)
      try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($source, 0, 0, $width, $height)
      } finally {
        $graphics.Dispose()
      }

      $temporaryPath = "$path.zep-normalized.png"
      $output.Save($temporaryPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $output.Dispose()
    }
  } finally {
    $source.Dispose()
  }

  Move-Item -LiteralPath $temporaryPath -Destination $path -Force
  Write-Output "RESIZED $([IO.Path]::GetFileName($path)) ${width}x${height}"
}
