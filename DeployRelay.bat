@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
set "WORKER_DIR=%ROOT%cloudflare\colabgg-relay"

echo ====================================================================
echo   ColabGG Cloudflare Relay + Web Client Deploy
echo ====================================================================
echo.

cd /d "%WORKER_DIR%"
if errorlevel 1 (
  echo [ERROR] Worker directory not found: "%WORKER_DIR%"
  pause
  exit /b 1
)

where wrangler >nul 2>&1
if errorlevel 1 (
  echo [ERROR] wrangler CLI not found. Install via: npm install -g wrangler
  pause
  exit /b 1
)

echo [*] Checking Cloudflare login...
call wrangler whoami >nul 2>&1
if errorlevel 1 (
  echo [*] Opening Cloudflare login...
  call wrangler login
  if errorlevel 1 (
    echo [ERROR] Cloudflare login failed.
    pause
    exit /b 1
  )
)

echo [*] Deploying colabgg-relay Worker + Web Client Static Assets...
call wrangler deploy
if errorlevel 1 (
  echo [ERROR] Deploy failed!
  pause
  exit /b 1
)

echo.
echo ====================================================================
echo   [OK] Deploy thanh cong!
echo   - Web Client URL : https://colabgg-relay.lefantasusdelimei.workers.dev
echo   - (Tuy chon) Chay SetupTurnSecrets.bat de kich hoat Cloudflare TURN UDP 1TB/thang!
echo ====================================================================
pause
endlocal
