@echo off
setlocal

REM DESTINATION:
REM server\tools\gh-mobility-browser-agent\install-startup.cmd
REM
REM Run this ONCE on each office computer.
REM It registers the GH Mobility Browser Agent to start silently at Windows login.
REM No Administrator rights are required because it uses HKCU.

set "AGENT_DIR=%~dp0"
set "VBS=%AGENT_DIR%start-agent.vbs"

if not exist "%VBS%" (
  echo ERROR: start-agent.vbs was not found in:
  echo %AGENT_DIR%
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  echo Install Node.js first, then run this file again.
  pause
  exit /b 1
)

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" ^
 /v "GH Mobility Browser Agent" ^
 /t REG_SZ ^
 /d "\"%SystemRoot%\System32\wscript.exe\" \"%VBS%\"" ^
 /f >nul

if errorlevel 1 (
  echo ERROR: Could not register Windows startup.
  pause
  exit /b 1
)

start "" "%SystemRoot%\System32\wscript.exe" "%VBS%"

echo.
echo GH Mobility Browser Agent installed.
echo It will start automatically when this Windows user signs in.
echo It has also been started now.
echo.
pause
