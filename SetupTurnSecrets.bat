@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
set "WORKER_DIR=%ROOT%cloudflare\colabgg-relay"

echo ====================================================================
echo   Cau hinh Cloudflare Realtime TURN UDP (Free 1,000 GB/thang)
echo ====================================================================
echo Huong dan lay Key mien phi tren Cloudflare Dashboard:
echo   1. Mo https://dash.cloudflare.com -^> chon muc "Calls" / "Realtime" -^> "TURN Apps"
echo   2. Bam "Create" -^> copy "Turn Token ID (Key ID)" va "API Token"
echo ====================================================================
echo.

cd /d "%WORKER_DIR%"
echo [Buoc 1/2] Dan CF_TURN_KEY_ID vao ben duoi va bam Enter:
call wrangler secret put CF_TURN_KEY_ID

echo.
echo [Buoc 2/2] Dan CF_TURN_API_TOKEN vao ben duoi va bam Enter:
call wrangler secret put CF_TURN_API_TOKEN

echo.
echo [OK] Da luu khoa Cloudflare TURN UDP len Worker! Tu gio moi phien ColabGG tu dong dung WebRTC UDP!
pause
endlocal
