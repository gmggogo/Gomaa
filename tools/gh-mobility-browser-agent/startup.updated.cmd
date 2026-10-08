@echo off
setlocal EnableExtensions

REM DESTINATION:
REM server\tools\gh-mobility-browser-agent\install-startup.cmd
REM
REM GH Mobility Browser Agent utility:
REM   1 = Install/start the local Windows agent at Windows login.
REM   2 = Restart the Oracle Cloud browser agent and show /health.
REM
REM Existing local-startup behavior is preserved.

set "AGENT_DIR=%~dp0"
set "VBS=%AGENT_DIR%start-agent.vbs"
set "SSH_KEY=D:\Sunbeamllc\server\oracle\ssh-key-2026-10-07.key"
set "ORACLE_HOST=opc@161.153.23.109"

echo.
echo =========================================
echo   GH Mobility Browser Agent Utility
echo =========================================
echo.
echo   1 - Install / Start Local Windows Agent
echo   2 - Restart Oracle Cloud Agent
echo   0 - Exit
echo.
set /p "CHOICE=Choose 0, 1, or 2: "

if "%CHOICE%"=="1" goto LOCAL
if "%CHOICE%"=="2" goto ORACLE
if "%CHOICE%"=="0" goto END

echo.
echo Invalid choice.
pause
goto END

:LOCAL
echo.
if not exist "%VBS%" (
  echo ERROR: start-agent.vbs was not found in:
  echo %AGENT_DIR%
  pause
  goto END
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  echo Install Node.js first, then run this file again.
  pause
  goto END
)

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" ^
 /v "GH Mobility Browser Agent" ^
 /t REG_SZ ^
 /d "\"%SystemRoot%\System32\wscript.exe\" \"%VBS%\"" ^
 /f >nul

if errorlevel 1 (
  echo ERROR: Could not register Windows startup.
  pause
  goto END
)

start "" "%SystemRoot%\System32\wscript.exe" "%VBS%"

echo.
echo GH Mobility Local Browser Agent installed.
echo It will start automatically when this Windows user signs in.
echo It has also been started now.
echo.
pause
goto END

:ORACLE
echo.
if not exist "%SSH_KEY%" (
  echo ERROR: Oracle SSH key was not found:
  echo %SSH_KEY%
  echo.
  pause
  goto END
)

where ssh >nul 2>nul
if errorlevel 1 (
  echo ERROR: Windows OpenSSH client was not found.
  pause
  goto END
)

echo Connecting to Oracle and restarting the GH Mobility Browser Agent...
echo.

ssh -i "%SSH_KEY%" %ORACLE_HOST% "pkill -f '[n]ode /home/opc/gh-mobility-browser-agent/agent.js' >/dev/null 2>&1 || true; cd /home/opc/gh-mobility-browser-agent; nohup xvfb-run -a node agent.js > agent.log 2>&1 < /dev/null & sleep 5; echo ==== HEALTH ====; curl -s http://127.0.0.1:18733/health"

echo.
echo.
echo Oracle restart command finished.
echo If HEALTH is shown above, send a photo of it to ChatGPT.
echo.
pause

:END
endlocal
