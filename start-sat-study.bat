@echo off
cd /d "%~dp0"
where npm >nul 2>&1
if errorlevel 1 (
  echo Need Node.js first: https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: npm install ...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "" http://localhost:5180
call npm run dev -- --port 5180 --host 127.0.0.1
pause
