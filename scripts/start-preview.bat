@echo off
setlocal
set "AMEOW_ROOT=D:\Ameow"
if not exist "%AMEOW_ROOT%\scripts\preview.ps1" (
    echo Preview script not found. Check AMEOW_ROOT in this BAT file.
    pause
    exit /b 1
)
where pwsh.exe >nul 2>&1
if errorlevel 1 (
    echo PowerShell 7 is required: pwsh.exe was not found.
    pause
    exit /b 1
)
where wt.exe >nul 2>&1
if errorlevel 1 (
    echo Windows Terminal is required: wt.exe was not found.
    pause
    exit /b 1
)
wt.exe -w new -d "%AMEOW_ROOT%" pwsh.exe -NoLogo -NoProfile -NoExit -ExecutionPolicy Bypass -File "%AMEOW_ROOT%\scripts\preview.ps1"
if errorlevel 1 pause
