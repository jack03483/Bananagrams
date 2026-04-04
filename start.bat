@echo off
cd /d "%~dp0\public"
echo.
echo   Bananagrams running at http://localhost:3001
echo   Open that URL in your browser to play!
echo   Press Ctrl+C to stop
echo.
python -m http.server 3001
