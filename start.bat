@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" (
  echo.
  echo DSH failed to start. See the error above.
  if "%~1"=="" pause
)
endlocal & exit /b %exitCode%
