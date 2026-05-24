<#
  build-icons.ps1
  Generates build\tray.png (32x32) and build\icon.ico (multi-size) from assets\logo.png.
  No external packages required — uses System.Drawing + manual ICO binary assembly.
  Run from repo root:  powershell -ExecutionPolicy Bypass -File scripts\build-icons.ps1
#>

param(
  [string]$Src  = "assets\logo.png",
  [string]$Dest = "build"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# ── helpers ────────────────────────────────────────────────────────────────────

function Resize-Bitmap([System.Drawing.Image]$img, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($img, 0, 0, $size, $size)
  $g.Dispose()
  return $bmp
}

function BitmapToPngBytes([System.Drawing.Bitmap]$bmp) {
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  return $ms.ToArray()
}

function Write-UInt16([System.IO.BinaryWriter]$w, [int]$v) { $w.Write([uint16]$v) }
function Write-UInt32([System.IO.BinaryWriter]$w, [long]$v) { $w.Write([uint32]$v) }

# ── sanity check ───────────────────────────────────────────────────────────────

$srcPath = Join-Path (Get-Location) $Src
if (-not (Test-Path $srcPath)) {
  Write-Error "Source not found: $srcPath"
  exit 1
}
if (-not (Test-Path $Dest)) { New-Item -ItemType Directory -Path $Dest | Out-Null }

$orig = [System.Drawing.Image]::FromFile($srcPath)

# ── 1. Tray icon ───────────────────────────────────────────────────────────────

$trayBmp  = Resize-Bitmap $orig 32
$trayPath = Join-Path (Get-Location) "$Dest\tray.png"
$trayBmp.Save($trayPath, [System.Drawing.Imaging.ImageFormat]::Png)
$trayBmp.Dispose()
Write-Output "[1/2] $Dest\tray.png  (32x32 tray icon)"

# ── 2. Multi-size ICO ──────────────────────────────────────────────────────────
# ICO with embedded PNG chunks (Vista+ format).
# Sizes: 16, 24, 32, 48, 64, 128, 256

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$chunks = @()
foreach ($sz in $sizes) {
  $bmp   = Resize-Bitmap $orig $sz
  $bytes = BitmapToPngBytes $bmp
  $bmp.Dispose()
  $chunks += ,@{ Size = $sz; Bytes = $bytes }
}

$icoPath = Join-Path (Get-Location) "$Dest\icon.ico"
$fs = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR header
Write-UInt16 $bw 0          # reserved
Write-UInt16 $bw 1          # type = ICO
Write-UInt16 $bw $chunks.Count

# Calculate offsets: header(6) + count*16 bytes of directory, then image data
$headerSize = 6 + ($chunks.Count * 16)
$offset = $headerSize

# ICONDIRENTRY array
foreach ($c in $chunks) {
  $w8 = if ($c.Size -eq 256) { 0 } else { $c.Size }
  $h8 = if ($c.Size -eq 256) { 0 } else { $c.Size }
  $bw.Write([byte]$w8)        # width
  $bw.Write([byte]$h8)        # height
  $bw.Write([byte]0)          # colorCount
  $bw.Write([byte]0)          # reserved
  Write-UInt16 $bw 1          # planes
  Write-UInt16 $bw 32         # bitCount
  Write-UInt32 $bw $c.Bytes.Length
  Write-UInt32 $bw $offset
  $offset += $c.Bytes.Length
}

# Image data blobs
foreach ($c in $chunks) {
  $bw.Write($c.Bytes)
}

$bw.Dispose()
$fs.Dispose()
$orig.Dispose()

Write-Output "[2/2] $Dest\icon.ico  (multi-size ICO: $($sizes -join ', ')px)"
Write-Output ""
Write-Output "Done. Build assets:"
Get-ChildItem $Dest | ForEach-Object { Write-Output "  $_" }
