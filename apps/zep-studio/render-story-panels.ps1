param(
  [string]$OutputDirectory = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $scriptDirectory 'assets\genesis\story-panels'
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$dataFile = Join-Path $scriptDirectory 'genesis-story-panels.js'
$dataJson = & node -e "process.stdout.write(JSON.stringify(require(process.argv[1])))" $dataFile
if ($LASTEXITCODE -ne 0) { throw '스토리 패널 데이터를 읽지 못했습니다.' }
$panels = $dataJson | ConvertFrom-Json

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Color([string]$hex, [int]$alpha = 255) {
  $value = $hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb($alpha, [Convert]::ToInt32($value.Substring(0,2),16), [Convert]::ToInt32($value.Substring(2,2),16), [Convert]::ToInt32($value.Substring(4,2),16))
}

function New-Font([string]$family, [float]$size, [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular) {
  return [System.Drawing.Font]::new($family, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Get-WrappedLines($graphics, [string]$text, $font, [float]$maxWidth) {
  $words = $text -split '\s+'
  $lines = [System.Collections.Generic.List[string]]::new()
  $current = ''
  foreach ($word in $words) {
    $candidate = if ($current) { "$current $word" } else { $word }
    if ($current -and $graphics.MeasureString($candidate, $font).Width -gt $maxWidth) {
      $lines.Add($current)
      $current = $word
    } else {
      $current = $candidate
    }
  }
  if ($current) { $lines.Add($current) }
  return $lines
}

function Draw-Visual($graphics, $panel, $palette) {
  $x = 900; $y = 164; $cx = 1048; $cy = 326
  $accentPen = [System.Drawing.Pen]::new($palette.Accent, 4)
  $accentPen.StartCap = $accentPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $thinPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(115, $palette.Accent), 2)
  $hotPen = [System.Drawing.Pen]::new($palette.Hot, 4)
  $fillBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(28, $palette.Accent))
  $hotBrush = [System.Drawing.SolidBrush]::new($palette.Hot)

  $graphics.DrawEllipse($thinPen, $cx - 125, $cy - 125, 250, 250)
  $graphics.DrawEllipse($thinPen, $cx - 96, $cy - 96, 192, 192)
  switch ($panel.visual) {
    'earth' {
      $graphics.FillEllipse($fillBrush, $cx - 82, $cy - 82, 164, 164)
      $graphics.DrawEllipse($accentPen, $cx - 82, $cy - 82, 164, 164)
      $graphics.DrawEllipse($thinPen, $cx - 82, $cy - 30, 164, 60)
      $graphics.DrawEllipse($thinPen, $cx - 34, $cy - 82, 68, 164)
      $points = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new($cx-58,$cy-40),[System.Drawing.PointF]::new($cx-30,$cy-55),[System.Drawing.PointF]::new($cx-6,$cy-39),
        [System.Drawing.PointF]::new($cx+8,$cy-12),[System.Drawing.PointF]::new($cx-12,$cy+5),[System.Drawing.PointF]::new($cx-18,$cy+42),
        [System.Drawing.PointF]::new($cx-50,$cy+50),[System.Drawing.PointF]::new($cx-70,$cy+15),[System.Drawing.PointF]::new($cx-55,$cy-7)
      )
      $graphics.DrawPolygon($accentPen, $points)
      $graphics.FillRectangle($hotBrush, $cx-92, $cy+88, 17, 17)
    }
    'moonbase' {
      $graphics.FillEllipse($fillBrush, $cx - 94, $cy - 94, 188, 188)
      $graphics.DrawEllipse($accentPen, $cx - 94, $cy - 94, 188, 188)
      $graphics.DrawEllipse($thinPen, $cx-60, $cy-12, 30, 30)
      $graphics.DrawEllipse($thinPen, $cx+18, $cy-55, 42, 42)
      $graphics.DrawEllipse($thinPen, $cx+4, $cy+45, 22, 22)
      $graphics.DrawRectangle($accentPen, $cx+39, $cy+12, 47, 36)
      $graphics.DrawLine($accentPen, $cx+62, $cy+12, $cx+62, $cy-38)
      $graphics.FillEllipse($hotBrush, $cx+56, $cy-45, 13, 13)
      $graphics.DrawLine($hotPen, $cx+62, $cy-39, $cx+16, $cy-72)
    }
    'signal' {
      for ($line = -80; $line -le 80; $line += 40) { $graphics.DrawLine($thinPen, $cx-110, $cy+$line, $cx+110, $cy+$line) }
      $points = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new($cx-112,$cy),[System.Drawing.PointF]::new($cx-83,$cy),[System.Drawing.PointF]::new($cx-67,$cy-33),
        [System.Drawing.PointF]::new($cx-48,$cy+55),[System.Drawing.PointF]::new($cx-29,$cy-88),[System.Drawing.PointF]::new($cx-6,$cy+91),
        [System.Drawing.PointF]::new($cx+17,$cy-47),[System.Drawing.PointF]::new($cx+38,$cy+22),[System.Drawing.PointF]::new($cx+61,$cy-10),
        [System.Drawing.PointF]::new($cx+83,$cy+14),[System.Drawing.PointF]::new($cx+112,$cy+14)
      )
      $graphics.DrawLines($accentPen, $points)
      $graphics.FillEllipse($hotBrush, $cx+31, $cy+15, 16, 16)
    }
    'astronaut' {
      $graphics.DrawEllipse($accentPen, $cx-47, $cy-104, 94, 94)
      $graphics.DrawArc($thinPen, $cx-36, $cy-91, 72, 54, 190, 160)
      $graphics.DrawRectangle($accentPen, $cx-39, $cy-5, 78, 115)
      $graphics.DrawLine($accentPen, $cx-39, $cy+15, $cx-86, $cy+55)
      $graphics.DrawLine($accentPen, $cx+39, $cy+15, $cx+86, $cy+55)
      $graphics.DrawLine($accentPen, $cx-21, $cy+110, $cx-34, $cy+137)
      $graphics.DrawLine($accentPen, $cx+21, $cy+110, $cx+34, $cy+137)
      $graphics.DrawRectangle($thinPen, $cx-23, $cy+20, 46, 34)
      $graphics.FillEllipse($hotBrush, $cx+6, $cy+31, 10, 10)
    }
    'warning' {
      $graphics.DrawRectangle($hotPen, $cx-112, $cy-82, 224, 164)
      $graphics.DrawLine($hotPen, $cx-112, $cy-82, $cx-81, $cy-50)
      $graphics.DrawLine($hotPen, $cx+112, $cy-82, $cx+81, $cy-50)
      $triangle = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new($cx,$cy-52),[System.Drawing.PointF]::new($cx-47,$cy+38),[System.Drawing.PointF]::new($cx+47,$cy+38))
      $graphics.DrawPolygon($hotPen, $triangle)
      $graphics.FillRectangle($hotBrush, $cx-5, $cy-21, 10, 37)
      $graphics.FillRectangle($hotBrush, $cx-5, $cy+24, 10, 10)
      $random = [System.Random]::new(507)
      for ($i=0; $i -lt 16; $i++) { $yy=$y+$random.Next(10,320); $graphics.DrawLine($thinPen,$x+$random.Next(0,65),$yy,$x+$random.Next(190,295),$yy) }
    }
    'navigation' {
      $graphics.DrawEllipse($accentPen, $cx-92, $cy-92, 184, 184)
      $graphics.DrawEllipse($thinPen, $cx-56, $cy-56, 112, 112)
      $graphics.DrawLine($thinPen, $cx-115, $cy, $cx+115, $cy)
      $graphics.DrawLine($thinPen, $cx, $cy-115, $cx, $cy+115)
      $graphics.DrawLine($accentPen, $cx, $cy, $cx+92, $cy-58)
      $marker = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new($cx+86,$cy-73),[System.Drawing.PointF]::new($cx+117,$cy-55),[System.Drawing.PointF]::new($cx+83,$cy-39),[System.Drawing.PointF]::new($cx+63,$cy-55))
      $graphics.FillPolygon($hotBrush, $marker)
      $graphics.FillEllipse($fillBrush, $cx-11, $cy-11, 22, 22)
    }
    'landing' {
      $rocket = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new($cx,$cy-106),[System.Drawing.PointF]::new($cx+36,$cy-18),[System.Drawing.PointF]::new($cx+23,$cy+63),[System.Drawing.PointF]::new($cx-23,$cy+63),[System.Drawing.PointF]::new($cx-36,$cy-18))
      $graphics.FillPolygon($fillBrush, $rocket); $graphics.DrawPolygon($accentPen, $rocket)
      $graphics.DrawEllipse($accentPen, $cx-17, $cy-47, 34, 34)
      $flame = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new($cx-13,$cy+63),[System.Drawing.PointF]::new($cx,$cy+137),[System.Drawing.PointF]::new($cx+13,$cy+63))
      $graphics.FillPolygon($hotBrush, $flame)
      $graphics.DrawArc($accentPen, $cx-118, $cy+55, 236, 112, 202, 136)
      $graphics.DrawLine($accentPen, $cx-91, $cy+120, $cx+91, $cy+120)
    }
  }
  $accentPen.Dispose(); $thinPen.Dispose(); $hotPen.Dispose(); $fillBrush.Dispose(); $hotBrush.Dispose()
}

$fontRegular = 'Noto Sans KR'
$fontMedium = 'Noto Sans KR Medium'
$fontBlack = 'Noto Sans KR Black'

foreach ($panel in $panels) {
  $tone = [string]$panel.tone
  $palette = switch ($tone) {
    'red' { @{ Accent=(New-Color '#ff7168'); Hot=(New-Color '#ff334e'); Panel=(New-Color '#16040d' 239); Panel2=(New-Color '#300814' 234); Line=(New-Color '#ff6a6e' 120) } }
    'mixed' { @{ Accent=(New-Color '#64dcff'); Hot=(New-Color '#ff5c55'); Panel=(New-Color '#061126' 239); Panel2=(New-Color '#19102a' 234); Line=(New-Color '#69d9ff' 115) } }
    'bright' { @{ Accent=(New-Color '#d6f8ff'); Hot=(New-Color '#68caff'); Panel=(New-Color '#06162b' 228); Panel2=(New-Color '#103f59' 220); Line=(New-Color '#d0f8ff' 165) } }
    default { @{ Accent=(New-Color '#61d9ff'); Hot=(New-Color '#347cff'); Panel=(New-Color '#030c1c' 239); Panel2=(New-Color '#081c35' 232); Line=(New-Color '#66d9ff' 112) } }
  }

  $bitmap = [System.Drawing.Bitmap]::new(1280, 720, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  for ($i=12; $i -ge 1; $i--) {
    $alpha = [Math]::Max(2, 18 - $i)
    $glowPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb($alpha, $palette.Accent), $i * 3)
    $glowPath = New-RoundedPath 36 36 1208 648 22
    $graphics.DrawPath($glowPen, $glowPath)
    $glowPen.Dispose(); $glowPath.Dispose()
  }

  $panelPath = New-RoundedPath 36 36 1208 648 22
  $panelBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Rectangle]::new(36,36,1208,648), $palette.Panel, $palette.Panel2, 18)
  $graphics.FillPath($panelBrush, $panelPath)
  $borderPen = [System.Drawing.Pen]::new($palette.Line, 2)
  $graphics.DrawPath($borderPen, $panelPath)

  $gridPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(10, $palette.Accent), 1)
  for ($gx=68; $gx -lt 1244; $gx+=32) { $graphics.DrawLine($gridPen,$gx,111,$gx,603) }
  for ($gy=111; $gy -lt 604; $gy+=32) { $graphics.DrawLine($gridPen,37,$gy,1243,$gy) }
  $separatorPen = [System.Drawing.Pen]::new($palette.Line, 1)
  $graphics.DrawLine($separatorPen, 37, 110, 1243, 110)
  $graphics.DrawLine($separatorPen, 37, 604, 1243, 604)

  $logoPen = [System.Drawing.Pen]::new($palette.Accent, 1)
  $graphics.DrawEllipse($logoPen, 69, 53, 42, 42)
  $graphics.DrawEllipse($logoPen, 65, 65, 50, 18)
  $graphics.DrawEllipse($logoPen, 77, 49, 18, 50)
  $microFont = New-Font $fontMedium 10 ([System.Drawing.FontStyle]::Bold)
  $smallFont = New-Font $fontMedium 11 ([System.Drawing.FontStyle]::Bold)
  $brandFont = New-Font $fontBlack 15 ([System.Drawing.FontStyle]::Bold)
  $bodySize = switch ([int]$panel.step) { 1 { 41 } 2 { 40 } 7 { 39 } default { 42 } }
  $bodyLineHeight = $bodySize + 13
  $recordFont = New-Font $fontBlack 18
  $titleFont = New-Font $fontBlack 64
  $bodyFont = New-Font $fontBlack $bodySize
  $highlightFont = New-Font $fontBlack $(if($panel.step -eq 7){52}else{44})
  $whiteBrush = [System.Drawing.SolidBrush]::new((New-Color '#f2f8ff'))
  $bodyBrush = [System.Drawing.SolidBrush]::new((New-Color '#f2f7fc'))
  $mutedBrush = [System.Drawing.SolidBrush]::new((New-Color '#7594aa'))
  $accentBrush = [System.Drawing.SolidBrush]::new($palette.Accent)
  $graphics.DrawString('GSA', $microFont, $accentBrush, 78, 68)
  $graphics.DrawString('PROJECT GENESIS', $brandFont, $whiteBrush, 126, 57)
  $graphics.DrawString('LUNA MISSION ARCHIVE', $microFont, $mutedBrush, 126, 79)

  $statusText = [string]$panel.header
  $statusWidth = [Math]::Max(150, [int]($graphics.MeasureString($statusText, $smallFont).Width + 46))
  $statusX = 1208 - $statusWidth
  $statusPath = New-RoundedPath $statusX 59 $statusWidth 32 8
  $statusBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(65, $palette.Panel2))
  $graphics.FillPath($statusBrush, $statusPath); $graphics.DrawPath($logoPen, $statusPath)
  $graphics.FillEllipse($accentBrush, $statusX+13, 71, 7, 7)
  $graphics.DrawString($statusText, $smallFont, $accentBrush, $statusX+28, 67)

  $graphics.DrawString([string]$panel.subheader, $recordFont, $accentBrush, 60, 137)
  $graphics.DrawLine($logoPen, 236, 154, 665, 154)
  $graphics.DrawString([string]$panel.title, $titleFont, $whiteBrush, 60, 162)

  $bodyY = 232
  $bodyText = (($panel.body | ForEach-Object { [string]$_ }) -join ' ')
  $bodyLines = Get-WrappedLines $graphics $bodyText $bodyFont 1180
  foreach ($line in $bodyLines) {
    $graphics.DrawString($line, $bodyFont, $bodyBrush, 60, $bodyY)
    $bodyY += $bodyLineHeight
  }
  $highlightY = $bodyY + 6
  $highlightHeight = [Math]::Max(80, 16 + (53 * $panel.highlight.Count))
  $highlightBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Rectangle]::new(60,$highlightY,1160,$highlightHeight), [System.Drawing.Color]::FromArgb(76,$palette.Hot), [System.Drawing.Color]::Transparent, 0)
  $graphics.FillRectangle($highlightBrush, 60, $highlightY, 1160, $highlightHeight)
  $hotBarBrush = [System.Drawing.SolidBrush]::new($palette.Hot)
  $graphics.FillRectangle($hotBarBrush, 60, $highlightY, 7, $highlightHeight)
  $hy = $highlightY + 9
  foreach ($line in $panel.highlight) {
    $graphics.DrawString([string]$line, $highlightFont, $whiteBrush, 84, $hy)
    $hy += 53
  }

  $graphics.DrawString('MISSION ARCHIVE', $microFont, $mutedBrush, 70, 629)
  $graphics.DrawString([string]$panel.footer, $smallFont, $bodyBrush, 70, 649)
  for ($i=0; $i -lt 7; $i++) {
    $px = 723 + ($i * 61)
    $progressColor = if ($i -lt $panel.step) { $palette.Accent } else { [System.Drawing.Color]::FromArgb(70, $palette.Accent) }
    $progressBrush = [System.Drawing.SolidBrush]::new($progressColor)
    $graphics.FillRectangle($progressBrush, $px, 644, 52, 7)
    $progressBrush.Dispose()
  }
  $graphics.DrawString(('{0:d2} / 07' -f [int]$panel.step), $recordFont, $accentBrush, 1156, 637)

  $output = Join-Path $OutputDirectory ('panel_{0:d2}.png' -f [int]$panel.step)
  $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "created $(Split-Path -Leaf $output)"

  $microFont.Dispose(); $smallFont.Dispose(); $brandFont.Dispose(); $recordFont.Dispose(); $titleFont.Dispose(); $bodyFont.Dispose(); $highlightFont.Dispose()
  $whiteBrush.Dispose(); $bodyBrush.Dispose(); $mutedBrush.Dispose(); $accentBrush.Dispose(); $statusBrush.Dispose(); $highlightBrush.Dispose(); $hotBarBrush.Dispose()
  $logoPen.Dispose(); $gridPen.Dispose(); $separatorPen.Dispose(); $borderPen.Dispose(); $panelBrush.Dispose(); $statusPath.Dispose(); $panelPath.Dispose()
  $graphics.Dispose(); $bitmap.Dispose()
}
