param(
    [switch]$Gnu
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  VEX IQ 3D Viewer (Native Rust) - Windows Build" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error "Cargo not found. Install Rust from https://win.rustup.rs/"
}

function Test-MsvcReady {
    $hasLink = $null -ne (Get-Command link.exe -ErrorAction SilentlyContinue)
    if (-not $hasLink) { return $false }
    if (-not $env:LIB) { return $false }
    foreach ($dir in ($env:LIB -split ';')) {
        if ($dir -and (Test-Path (Join-Path $dir "kernel32.lib"))) {
            return $true
        }
    }
    return $false
}

$useGnu = $Gnu.IsPresent

if (-not $useGnu -and -not (Test-MsvcReady)) {
    $vsPaths = @(
        "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
        "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
        "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat",
        "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat",
        "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
        "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
        "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat"
    )
    $foundVs = $vsPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($foundVs) {
        Write-Host "[*] Loading MSVC + Windows SDK environment from: $foundVs" -ForegroundColor Yellow
        cmd /c "`"$foundVs`" && set" | ForEach-Object {
            if ($_ -match "^(.*?)=(.*)$") {
                [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
            }
        }
    }
}

if (-not $useGnu -and -not (Test-MsvcReady)) {
    Write-Host "[!] Windows SDK (kernel32.lib) is not configured or missing in Visual Studio." -ForegroundColor Yellow
    Write-Host "[*] Switching to standalone GNU toolchain (stable-x86_64-pc-windows-gnu)..." -ForegroundColor Cyan
    $useGnu = $true
}

$toolchainArg = $null
if ($useGnu) {
    $installed = rustup toolchain list
    if (-not ($installed -match "stable-x86_64-pc-windows-gnu")) {
        Write-Host "[*] Installing stable-x86_64-pc-windows-gnu via rustup..." -ForegroundColor Cyan
        rustup toolchain install stable-x86_64-pc-windows-gnu
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install stable-x86_64-pc-windows-gnu toolchain."
        }
    }
    $toolchainArg = "+stable-x86_64-pc-windows-gnu"
} else {
    Write-Host "[*] MSVC + Windows SDK verified (kernel32.lib found)." -ForegroundColor Green
}

Write-Host "[1/2] Building cargo release binary..."
if ($toolchainArg) {
    cargo $toolchainArg build --release
} else {
    cargo build --release
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Cargo build failed with exit code $LASTEXITCODE"
}

Write-Host "[2/2] Packaging standalone portable ZIP..."
$outDir = "dist\VEX-IQ-Viewer-Windows-x64"
if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Copy-Item "target\release\vex-iq-viewer.exe" "$outDir\vex-iq-viewer.exe"

@"
VEX IQ 3D CAD Viewer (Native Rust - Windows Portable)
=====================================================

No installation required:
1. Run vex-iq-viewer.exe.
2. Put stl/ folder next to the .exe, drag & drop ZIP/STL files,
   or click "Download ZIP / Releases" in the app.
"@ | Out-File -Encoding UTF8 "$outDir\README.txt"

$zipPath = "dist\VEX-IQ-Viewer-Windows-x64-Portable.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path "$outDir\*" -DestinationPath $zipPath

Write-Host "[OK] Done! Portable archive: $zipPath" -ForegroundColor Green
