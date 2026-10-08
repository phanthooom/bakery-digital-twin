@echo off
chcp 65001 >nul
rem Запуск фронтенда цифрового двойника (мок-данные, без бэкенда).
rem Двойной клик по файлу или: scripts\start-dev.bat
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js не найден. Установите Node.js 20+ с https://nodejs.org и запустите снова
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
  echo [!] Нужен Node.js 20+, сейчас:
  node -v
  pause
  exit /b 1
)

if not exist node_modules (
  echo === npm install ^(первый запуск, 1-2 минуты^) ===
  call npm install
  if errorlevel 1 (
    echo [!] npm install завершился с ошибкой
    pause
    exit /b 1
  )
)

echo === Открываю http://localhost:5173 ===
call npm run dev -w web -- --open
pause
