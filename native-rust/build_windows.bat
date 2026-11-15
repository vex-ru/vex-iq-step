@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ==================================================
echo   VEX IQ 3D Viewer (Native Rust) - Windows Build
echo ==================================================

where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Rust / Cargo not found!
    echo     Install from: https://win.rustup.rs/
    pause
    exit /b 1
)

set "TOOLCHAIN_FLAG="

:: 1. Check if MSVC link.exe AND kernel32.lib (Windows SDK) are already configured
call :check_msvc_ready
if %errorlevel% equ 0 (
    echo [*] MSVC + Windows SDK already configured.
    goto :do_build
)

:: 2. Search for Visual Studio 2022 / 2019 vcvars64.bat and load LIB/INCLUDE/PATH
for %%E in (Community BuildTools Professional Enterprise) do (
    if exist "C:\Program Files\Microsoft Visual Studio\2022\%%E\VC\Auxiliary\Build\vcvars64.bat" (
        echo [*] Found VS 2022 %%E. Loading MSVC + Windows SDK environment...
        call "C:\Program Files\Microsoft Visual Studio\2022\%%E\VC\Auxiliary\Build\vcvars64.bat" >nul
        goto :verify_after_vcvars
    )
    if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\%%E\VC\Auxiliary\Build\vcvars64.bat" (
        echo [*] Found VS 2022 %%E. Loading MSVC + Windows SDK environment...
        call "C:\Program Files (x86)\Microsoft Visual Studio\2022\%%E\VC\Auxiliary\Build\vcvars64.bat" >nul
        goto :verify_after_vcvars
    )
    if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\%%E\VC\Auxiliary\Build\vcvars64.bat" (
        echo [*] Found VS 2019 %%E. Loading MSVC + Windows SDK environment...
        call "C:\Program Files (x86)\Microsoft Visual Studio\2019\%%E\VC\Auxiliary\Build\vcvars64.bat" >nul
        goto :verify_after_vcvars
    )
)

:verify_after_vcvars
call :check_msvc_ready
if %errorlevel% equ 0 (
    echo [*] MSVC + Windows SDK verified ^(kernel32.lib found^).
    goto :do_build
)

:: 3. Windows SDK (kernel32.lib) missing -> Use standalone Rust GNU toolchain
echo [!] Windows SDK ^(kernel32.lib^) was not found in Visual Studio.
echo [*] Switching to standalone GNU toolchain ^(stable-x86_64-pc-windows-gnu^)...
rustup toolchain list | findstr /c:"stable-x86_64-pc-windows-gnu" >nul
if %errorlevel% neq 0 (
    echo [*] Installing stable-x86_64-pc-windows-gnu via rustup...
    rustup toolchain install stable-x86_64-pc-windows-gnu
    if %errorlevel% neq 0 (
        echo [!] Failed to install GNU toolchain.
        pause
        exit /b 1
    )
)
set "TOOLCHAIN_FLAG=+stable-x86_64-pc-windows-gnu"

:do_build
echo [1/2] Building optimized release executable...
cargo %TOOLCHAIN_FLAG% build --release
if %errorlevel% neq 0 (
    echo [!] Build failed!
    pause
    exit /b 1
)

echo [2/2] Packaging standalone portable ZIP...
set "OUT_DIR=dist\VEX-IQ-Viewer-Windows-x64"
if exist "%OUT_DIR%" rmdir /s /q "%OUT_DIR%"
mkdir "%OUT_DIR%"

copy /y "target\release\vex-iq-viewer.exe" "%OUT_DIR%\vex-iq-viewer.exe" >nul

(
echo VEX IQ 3D CAD Viewer ^(Native Rust - Windows Portable^)
echo =======================================================
echo.
echo Usage ^(No installation required^):
echo 1. Extract the archive into any folder.
echo 2. Run vex-iq-viewer.exe.
echo 3. Place the stl\ folder next to the exe, drag and drop ZIP/STL files,
echo    or click "Download ZIP / Releases" inside the app.
) > "%OUT_DIR%\README.txt"

powershell -NoProfile -Command "Compress-Archive -Path '%OUT_DIR%\*' -DestinationPath 'dist\VEX-IQ-Viewer-Windows-x64-Portable.zip' -Force"

echo.
echo [OK] Build completed!
echo      Executable:   %OUT_DIR%\vex-iq-viewer.exe
echo      Portable ZIP: dist\VEX-IQ-Viewer-Windows-x64-Portable.zip
pause
exit /b 0

:check_msvc_ready
where link.exe >nul 2>nul
if %errorlevel% neq 0 exit /b 1
if not defined LIB exit /b 1
powershell -NoProfile -Command "if (($env:LIB -split ';') | Where-Object { $_ -and (Test-Path (Join-Path $_ 'kernel32.lib')) }) { exit 0 } else { exit 1 }"
exit /b %errorlevel%
