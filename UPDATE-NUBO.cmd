@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo  NUBO production update
echo ========================================

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-nubo-production.ps1"
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo NUBO update failed. Exit code: %EXIT_CODE%
  pause
)

exit /b %EXIT_CODE%
