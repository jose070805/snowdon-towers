@echo off
cd /d "%~dp0"
if not exist "node_modules\.bin\vite.cmd" (
  call npm.cmd ci
  if errorlevel 1 goto failed
)
call npm.cmd run dev
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
