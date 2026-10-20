$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $root 'weathered-biolab-app'
$stationPath = Join-Path $root 'ribosome-epa-assembly-station.png'
$cargoPath = Join-Path $root 'amino-acid-cargo-pod.png'
$railPath = Join-Path $root 'ribosome-conveyor-straight.png'
$robotArmAnimationPath = Join-Path $root 'ribosome-robot-arm-animation-source.png'
$spaceRoot = Resolve-Path (Join-Path $root '..\..\space-backgrounds')
$mapPath = Join-Path $spaceRoot 'space-experiment-lab.png'
$topPath = Join-Path $spaceRoot 'space-experiment-lab-top.png'
$weatherPath = Join-Path $spaceRoot 'weathered-station-atmosphere.png'

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

$frameWidth = 320
$frameHeight = 224
$frameCount = 8
$sheet = New-Canvas ($frameWidth * $frameCount) $frameHeight
$sheetGraphics = [System.Drawing.Graphics]::FromImage($sheet)
Set-HighQuality $sheetGraphics
$sheetGraphics.Clear([System.Drawing.Color]::Transparent)

$station = [System.Drawing.Bitmap]::new($stationPath)
$cargo = [System.Drawing.Bitmap]::new($cargoPath)
$cargoX = @(266, 232, 198, 164, 130, 96, 62, 28)
$cargoY = @(120, 123, 126, 129, 132, 135, 138, 141)

for ($frame = 0; $frame -lt $frameCount; $frame++) {
  $offsetX = $frame * $frameWidth
  $sheetGraphics.DrawImage($station, $offsetX, 0, $frameWidth, $frameHeight)
  $sheetGraphics.DrawImage($cargo, $offsetX + $cargoX[$frame], $cargoY[$frame], 45, 30)
}

$sheet.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
$sheetPath = Join-Path $app 'ribosome-factory-line.png'
$sheet.Save($sheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$sheetGraphics.Dispose()
$sheet.Dispose()
$station.Dispose()
$cargo.Dispose()

Save-ResizedPng $railPath (Join-Path $app 'ribosome-conveyor-straight.png') 192 96
Save-ResizedPng $cargoPath (Join-Path $app 'amino-acid-cargo-pod.png') 56 56
Save-ResizedPng $robotArmAnimationPath (Join-Path $app 'ribosome-robot-arm-animated.png') 480 160
Save-ResizedPng $stationPath (Join-Path $app 'app-icon.png') 256 256

# 960×640 실제 맵 위에 설치 위치를 합성한 교사용 미리보기입니다.
$preview = New-Canvas 960 640
$previewGraphics = [System.Drawing.Graphics]::FromImage($preview)
Set-HighQuality $previewGraphics
$previewGraphics.Clear([System.Drawing.Color]::Black)

$map = [System.Drawing.Bitmap]::new($mapPath)
$weather = [System.Drawing.Bitmap]::new($weatherPath)
$top = [System.Drawing.Bitmap]::new($topPath)
$factoryFrame = [System.Drawing.Bitmap]::new($sheetPath)
$rail = [System.Drawing.Bitmap]::new((Join-Path $app 'ribosome-conveyor-straight.png'))
$cargoPod = [System.Drawing.Bitmap]::new((Join-Path $app 'amino-acid-cargo-pod.png'))
$robotArm = [System.Drawing.Bitmap]::new((Join-Path $app 'ribosome-robot-arm-animated.png'))

$previewGraphics.DrawImage($map, 0, 0, 960, 640)
$weatherAttributes = [System.Drawing.Imaging.ImageAttributes]::new()
$colorMatrix = [System.Drawing.Imaging.ColorMatrix]::new()
$colorMatrix.Matrix33 = 0.52
$weatherAttributes.SetColorMatrix($colorMatrix)
$previewGraphics.DrawImage($weather, [System.Drawing.Rectangle]::new(0, 0, 960, 640), 0, 0, $weather.Width, $weather.Height, [System.Drawing.GraphicsUnit]::Pixel, $weatherAttributes)
$previewGraphics.DrawImage($factoryFrame, [System.Drawing.Rectangle]::new(560, 256, 320, 224), 0, 0, 320, 224, [System.Drawing.GraphicsUnit]::Pixel)
$previewGraphics.DrawImage($rail, 320, 448, 192, 96)
$previewGraphics.DrawImage($rail, 480, 384, 192, 96)
$previewGraphics.DrawImage($rail, 640, 320, 192, 96)
$previewGraphics.DrawImage($robotArm, [System.Drawing.Rectangle]::new(520, 288, 80, 160), 0, 0, 80, 160, [System.Drawing.GraphicsUnit]::Pixel)
$previewGraphics.DrawImage($robotArm, [System.Drawing.Rectangle]::new(736, 288, 80, 160), 80, 0, 80, 160, [System.Drawing.GraphicsUnit]::Pixel)
$previewGraphics.DrawImage($cargoPod, 608, 336, 56, 56)
$previewGraphics.DrawImage($top, 0, 0, 960, 640)

$previewPath = Join-Path $root 'weathered-biolab-ribosome-room-preview.png'
$preview.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)

$weatherAttributes.Dispose()
$previewGraphics.Dispose()
$preview.Dispose()
$map.Dispose()
$weather.Dispose()
$top.Dispose()
$factoryFrame.Dispose()
$rail.Dispose()
$cargoPod.Dispose()
$robotArm.Dispose()

$zipPath = Join-Path $root 'zep-weathered-biolab-ribosome-room-upload.zip'
$uploadFiles = @(
  (Join-Path $app 'main.js'),
  (Join-Path $app 'ribosome-factory-line.png'),
  (Join-Path $app 'ribosome-conveyor-straight.png'),
  (Join-Path $app 'ribosome-robot-arm-animated.png'),
  (Join-Path $app 'amino-acid-cargo-pod.png')
)
Compress-Archive -LiteralPath $uploadFiles -DestinationPath $zipPath -Force

Write-Output "Created $zipPath"
Write-Output "Created $previewPath"
