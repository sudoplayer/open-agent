@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_frontend.ps1"
if errorlevel 1 exit /b 1
