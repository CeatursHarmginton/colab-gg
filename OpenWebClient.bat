@echo off
setlocal
set "LOCAL_HTML=%~dp0cloudflare\colabgg-relay\public\index.html"
echo Opening ColabGG Web Client...
start "" "https://colabgg-relay.lefantasusdelimei.workers.dev"
endlocal
