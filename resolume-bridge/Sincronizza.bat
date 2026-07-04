@echo off
cd /d "%~dp0"
echo === Sincronizzazione Brasserie ===
echo.
call npm run sync
echo.
pause
