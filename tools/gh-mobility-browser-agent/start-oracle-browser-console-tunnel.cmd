@echo off
setlocal
title GH Mobility Oracle Browser Console Tunnel

set "SSH_KEY=D:\Sunbeamllc\server\oracle\ssh-key-2026-10-07.key"
set "SSH_HOST=opc@161.153.23.109"
set "LOCAL_PORT=6080"
set "REMOTE_PORT=6080"

echo ==========================================
echo GH Mobility Oracle Browser Console Tunnel
echo ==========================================
echo.
echo This creates a secure SSH tunnel only.
echo Oracle noVNC stays bound to 127.0.0.1 and is NOT exposed publicly.
echo.

REM Kill an old tunnel that is already using local port 6080, if present.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":6080 " ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)

echo Starting SSH tunnel...
start "GH Oracle Console Tunnel" /min ssh ^
  -o ServerAliveInterval=30 ^
  -o ServerAliveCountMax=3 ^
  -N ^
  -L %LOCAL_PORT%:127.0.0.1:%REMOTE_PORT% ^
  -i "%SSH_KEY%" ^
  %SSH_HOST%

timeout /t 3 /nobreak >nul

echo.
echo Opening Oracle browser console...
start "" "http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale&view_only=0"

echo.
echo Keep the minimized SSH tunnel window running while using Marketplace.
timeout /t 4 /nobreak >nul
exit /b 0
