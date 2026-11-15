$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = "vex-ru/vex-iq-step"
$AssetName = "VEX-IQ-Viewer-Windows-x64-Portable.zip"
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\VEX-IQ-Viewer"
$ExePath = Join-Path $InstallDir "vex-iq-viewer.exe"
$TempZip = Join-Path $env:TEMP ("vex-iq-viewer-" + [guid]::NewGuid().ToString("N") + ".zip")
$TempExtract = Join-Path $env:TEMP ("vex-iq-extract-" + [guid]::NewGuid().ToString("N"))

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  VEX IQ 3D CAD Viewer - Windows Installer" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

$DownloadUrl = "https://github.com/$Repo/releases/latest/download/$AssetName"
$VersionTag = "latest"

try {
    $Releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases?per_page=15" -Headers @{ "User-Agent" = "vex-iq-installer" }
    foreach ($Rel in $Releases) {
        if ($Rel.draft -or $Rel.prerelease) { continue }
        $MatchedAsset = $Rel.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
        if ($MatchedAsset -and $MatchedAsset.browser_download_url) {
            $VersionTag = $Rel.tag_name
            $DownloadUrl = $MatchedAsset.browser_download_url
            break
        }
    }
} catch {
    Write-Host "[!] GitHub API lookup skipped, using direct latest release URL..." -ForegroundColor Yellow
}

Write-Host "[1/4] Downloading $VersionTag ($AssetName)..." -ForegroundColor White
Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempZip -UseBasicParsing

Write-Host "[2/4] Installing to $InstallDir..." -ForegroundColor White
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

# Stop running instance before replacing binary
Get-Process -Name "vex-iq-viewer" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

Expand-Archive -Path $TempZip -DestinationPath $TempExtract -Force
$FoundExe = Get-ChildItem -Path $TempExtract -Recurse -Filter "vex-iq-viewer.exe" | Select-Object -First 1
if (-not $FoundExe) {
    throw "vex-iq-viewer.exe not found inside downloaded archive."
}

Copy-Item -Path $FoundExe.FullName -Destination $ExePath -Force

$UninstallScript = Join-Path $InstallDir "uninstall.ps1"
@"
`$ErrorActionPreference = "SilentlyContinue"
Get-Process -Name "vex-iq-viewer" | Stop-Process -Force
Start-Sleep -Milliseconds 300
Remove-Item -Force (Join-Path ([Environment]::GetFolderPath("Desktop")) "VEX IQ 3D CAD Viewer.lnk")
Remove-Item -Force (Join-Path ([Environment]::GetFolderPath("Programs")) "VEX IQ 3D CAD Viewer.lnk")
Remove-Item -Recurse -Force "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VEX-IQ-Viewer"
Start-Process cmd.exe -WindowStyle Hidden -ArgumentList "/c ping 127.0.0.1 -n 2 > nul && rmdir /s /q `"$InstallDir`""
"@ | Out-File -Encoding ASCII -FilePath $UninstallScript

Write-Host "[3/4] Creating Desktop & Start Menu shortcuts..." -ForegroundColor White
$WshShell = New-Object -ComObject WScript.Shell

$DesktopDir = [Environment]::GetFolderPath("Desktop")
$StartProgramsDir = [Environment]::GetFolderPath("Programs")

foreach ($ShortcutDir in @($DesktopDir, $StartProgramsDir)) {
    if ($ShortcutDir -and (Test-Path $ShortcutDir)) {
        $LnkPath = Join-Path $ShortcutDir "VEX IQ 3D CAD Viewer.lnk"
        $Shortcut = $WshShell.CreateShortcut($LnkPath)
        $Shortcut.TargetPath = $ExePath
        $Shortcut.WorkingDirectory = $InstallDir
        $Shortcut.Description = "VEX IQ 3D CAD Viewer (Native Rust)"
        $Shortcut.Save()
    }
}

Write-Host "[4/4] Registering app in Windows Uninstall list..." -ForegroundColor White
$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VEX-IQ-Viewer"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "DisplayName" -Value "VEX IQ 3D CAD Viewer"
Set-ItemProperty -Path $RegPath -Name "DisplayVersion" -Value ($VersionTag -replace '^v', '')
Set-ItemProperty -Path $RegPath -Name "Publisher" -Value "VEX RU Community"
Set-ItemProperty -Path $RegPath -Name "InstallLocation" -Value $InstallDir
Set-ItemProperty -Path $RegPath -Name "DisplayIcon" -Value $ExePath
Set-ItemProperty -Path $RegPath -Name "UninstallString" -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$UninstallScript`""
Set-ItemProperty -Path $RegPath -Name "NoModify" -Value 1 -Type DWord
Set-ItemProperty -Path $RegPath -Name "NoRepair" -Value 1 -Type DWord

Remove-Item -Force $TempZip -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $TempExtract -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[OK] Installed successfully: $ExePath" -ForegroundColor Green
Write-Host "     Auto-updates are built into the app (no need to re-run installer)." -ForegroundColor Gray
Write-Host "     Launching VEX IQ 3D CAD Viewer..." -ForegroundColor Cyan
Start-Process -FilePath $ExePath -WorkingDirectory $InstallDir
