@echo off
cd /d "%~dp0"
title Upload USB to Maxim
echo.
echo  Starting upload...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0UploadUsbToMaxim.ps1"
echo.
echo  (PowerShell finished - window stays open so you can read the message.)
pause
