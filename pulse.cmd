@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  node src\cli.js --demo
  echo.
  echo Live review: pulse.cmd --local .
  echo GitHub review: pulse.cmd --repo OWNER/REPO --pr NUMBER
  pause
) else (
  node src\cli.js %*
)
