@echo off
chcp 65001 >nul
cd /d "%~dp0"

title Service Desk — Laragon

color 0b
echo ========================================
echo    Service Desk — Запуск на Laragon
echo ========================================
echo.
echo Папка проекта: %CD%
echo.

:: ========== ПРОВЕРКА LARAGON ==========
set LARAGON_WWW=C:\laragon\www
set IN_LARAGON=0
echo %CD% | findstr /i "%LARAGON_WWW%" >nul && set IN_LARAGON=1

:: ========== ШАГ 1: Node.js ==========
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js не найден. Установите с https://nodejs.org
    pause
    exit /b
)

:: ========== ШАГ 2: Laragon MySQL ==========
if %IN_LARAGON%==1 (
    echo [*] Проверка MySQL...
    if exist "C:\laragon\bin\mysql\mysql-8.0.30-winx64\bin\mysql.exe" (
        set MYSQL=C:\laragon\bin\mysql\mysql-8.0.30-winx64\bin\mysql
    ) else (
        for /d %%i in ("C:\laragon\bin\mysql\*") do set MYSQL_DIR=%%i
        if defined MYSQL_DIR (
            set MYSQL=%MYSQL_DIR%\bin\mysql
        )
    )
    if defined MYSQL (
        echo   MySQL найден. Импорт БД если нет...
        "%MYSQL%" -u root -e "USE servicedesk" 2>nul || (
            echo   Импорт seed.sql...
            "%MYSQL%" -u root < "server\seed.sql"
            if %errorlevel%==0 (
                echo   [OK] База servicedesk импортирована.
            )
        )
    ) else (
        echo   [!] MySQL не найден. Запустите Laragon ^> Start All.
    )
)

:: ========== ШАГ 3: .env ==========
if not exist "server\.env" (
    echo [*] server\.env не найден, создаю из .env.example...
    copy "server\.env.example" "server\.env" >nul
    if %IN_LARAGON%==1 (
        echo   (настройки для Laragon — по умолчанию root без пароля)
    )
)

:: ========== ШАГ 4: Зависимости ==========
if not exist "node_modules" (
    echo [*] Установка зависимостей фронтенда...
    call npm install
) else (
    echo [*] Зависимости фронтенда есть.
)
if not exist "server\node_modules" (
    echo [*] Установка зависимостей сервера...
    cd server
    call npm install
    cd ..
) else (
    echo [*] Зависимости сервера есть.
)

:: ========== ШАГ 5: Nginx vhost (Laragon) ==========
if %IN_LARAGON%==1 (
    if not exist "C:\laragon\etc\nginx\sites-enabled\servicedesk.conf" (
        echo [*] Настройка Nginx vhost (tickets.test)...
        copy "laragon\nginx\servicedesk.conf" "C:\laragon\etc\nginx\sites-enabled\" >nul
        echo   Конфиг скопирован. Перезапустите Nginx в Laragon.
    )
)

:: ========== ШАГ 6: Запуск ==========
echo [*] Остановка старых процессов...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /f /pid %%a >nul 2>&1

echo [*] Запуск серверов...
start "SD API" /min cmd /c "cd /d %CD%\server && npm run dev"
start "SD Frontend" /min cmd /c "cd /d %CD% && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo    Запущено!
if %IN_LARAGON%==1 (
    echo    Frontend: http://tickets.test
)
echo    Frontend: http://localhost:5173
echo    API:      http://localhost:4000
echo    MySQL:    localhost:3306
echo.
echo    Dev-логин: POST /api/auth/dev-login
echo ========================================
echo.
echo Нажмите любую клавишу чтобы остановить...
pause >nul

:: Остановка
echo Остановка...
taskkill /f /fi "WINDOWTITLE eq SD API*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq SD Frontend*" >nul 2>&1
echo Готово.
