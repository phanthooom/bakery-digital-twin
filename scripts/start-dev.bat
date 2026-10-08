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

rem npm install — при первом запуске и когда package-lock.json новее установленных пакетов (добавили зависимость)
node -e "const fs=require('fs');let b=0;try{b=fs.statSync('node_modules/.package-lock.json').mtimeMs}catch(e){};process.exit(b>=fs.statSync('package-lock.json').mtimeMs?0:1)"
if errorlevel 1 (
  echo === npm install ^(новые пакеты, 1-2 минуты^) ===
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
