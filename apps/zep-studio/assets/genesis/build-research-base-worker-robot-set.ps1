$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$objects = Join-Path $root 'objects'
$names = @(
  'genesis-worker-robot-idle.png',
  'genesis-worker-robot-walking.png',
  'genesis-worker-robot-console.png',
  'genesis-worker-robot-carrying.png',
  'genesis-worker-robot-maintenance.png',
  'genesis-worker-robot-alert.png'
)

foreach ($name in $names) {
  $path = Join-Path $objects $name
  $source = [System.Drawing.Bitmap]::new($path)
  try {
    $scale = [Math]::Min(1.0, 1024.0 / [Math]::Max($source.Width, $source.Height))
    if ($scale -ge 1.0) { continue }

    $width = [Math]::Max(1, [int][Math]::Round($source.Width * $scale))
    $height = [Math]::Max(1, [int][Math]::Round($source.Height * $scale))
    $output = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($output)
      try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($source, 0, 0, $width, $height)
      } finally {
        $graphics.Dispose()
      }
      $temporary = "$path.normalized.png"
      $output.Save($temporary, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $output.Dispose()
    }
  } finally {
    $source.Dispose()
  }

  Move-Item -LiteralPath $temporary -Destination $path -Force
}

$readme = Join-Path $objects 'research-base-worker-robot-set-README.md'
$zip = Join-Path $objects 'research-base-worker-robot-set.zip'
Compress-Archive -LiteralPath (($names | ForEach-Object { Join-Path $objects $_ }) + $readme) -DestinationPath $zip -Force

Write-Host "Built $zip"
