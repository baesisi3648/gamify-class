$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $root 'zep-app'
$stationPath = Join-Path $root 'ribosome-epa-assembly-station.png'
$cargoPath = Join-Path $root 'amino-acid-cargo-pod.png'
$railPath = Join-Path $root 'ribosome-conveyor-straight.png'

function New-Canvas([int]$width, [int]$height) {
  return [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Set-HighQuality($graphics) {
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
}

function Save-ResizedPng($sourcePath, $destinationPath, [int]$width, [int]$height) {
  $source = [System.Drawing.Bitmap]::new($sourcePath)
  $canvas = New-Canvas $width $height
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  Set-HighQuality $graphics
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($source, 0, 0, $width, $height)
  $canvas.Save($destinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $canvas.Dispose()
  $source.Dispose()
}

New-Item -ItemType Directory -Path $app -Force | Out-Null

$frameWidth = 384
$frameHeight = 256
$frameCount = 8
$sheet = New-Canvas ($frameWidth * $frameCount) $frameHeight
$sheetGraphics = [System.Drawing.Graphics]::FromImage($sheet)
Set-HighQuality $sheetGraphics
$sheetGraphics.Clear([System.Drawing.Color]::Transparent)

$station = [System.Drawing.Bitmap]::new($stationPath)
$cargo = [System.Drawing.Bitmap]::new($cargoPath)
$cargoX = @(318, 278, 238, 198, 158, 118, 78, 38)
$cargoY = @(137, 141, 145, 149, 153, 157, 161, 165)

for ($frame = 0; $frame -lt $frameCount; $frame++) {
  $offsetX = $frame * $frameWidth
  $sheetGraphics.DrawImage($station, $offsetX, 0, $frameWidth, $frameHeight)
  $sheetGraphics.DrawImage($cargo, $offsetX + $cargoX[$frame], $cargoY[$frame], 54, 36)
}

$sheetPath = Join-Path $app 'ribosome-factory-line.png'
$sheet.Save($sheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$sheetGraphics.Dispose()
$sheet.Dispose()
$station.Dispose()
$cargo.Dispose()

Save-ResizedPng $railPath (Join-Path $app 'ribosome-conveyor-straight.png') 256 128
Save-ResizedPng $cargoPath (Join-Path $app 'amino-acid-cargo-pod.png') 64 64
Save-ResizedPng $stationPath (Join-Path $app 'app-icon.png') 256 256

$zipPath = Join-Path $root 'zep-ribosome-factory-upload.zip'
$uploadFiles = @(
  (Join-Path $app 'main.js'),
  (Join-Path $app 'ribosome-factory-line.png'),
  (Join-Path $app 'ribosome-conveyor-straight.png'),
  (Join-Path $app 'amino-acid-cargo-pod.png')
)
Compress-Archive -LiteralPath $uploadFiles -DestinationPath $zipPath -Force

Write-Output "Created $zipPath"

