@echo off
cd /d "%~dp0"
echo === Applica config a Resolume (modalita Live) ===
echo.
call npm run live
echo.
pause
