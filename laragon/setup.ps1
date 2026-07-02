<#
.SYNOPSIS
    Настройка Service Desk для Laragon (пошагово)
.DESCRIPTION
    Копирует проект в C:\laragon\www\Tickets, импортирует БД,
    настраивает nginx vhost, устанавливает зависимости и запускает
#>

$ErrorActionPreference = "Stop"
$PROJECT_SRC = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$LARAGON_ROOT = "C:\laragon"
$WWW_DIR = "$LARAGON_ROOT\www\Tickets"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Service Desk — Установка на Laragon"  -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Шаг 1: Копирование проекта ---
Write-Host "[1/8] Копирование проекта в $WWW_DIR..." -ForegroundColor Yellow
if (Test-Path $WWW_DIR) {
    Write-Host "  Папка уже существует. Пропускаем." -ForegroundColor Gray
} else {
    New-Item -ItemType Directory -Path $WWW_DIR -Force | Out-Null
    Copy-Item -Path "$PROJECT_SRC\*" -Destination $WWW_DIR -Recurse -Exclude @("node_modules", "dist", "server\node_modules")
    Write-Host "  Готово." -ForegroundColor Green
}

# --- Шаг 2: Проверка MySQL (Laragon) ---
Write-Host "[2/8] Проверка MySQL..." -ForegroundColor Yellow
$mysql = "$LARAGON_ROOT\bin\mysql\mysql-8.0.30-winx64\bin\mysql.exe"
if (-not (Test-Path $mysql)) {
    # Ищем mysql в bin/laragon
    $mysql = Get-ChildItem "$LARAGON_ROOT\bin\mysql" -Recurse -Filter "mysql.exe" | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $mysql) {
    Write-Host "  MySQL не найден. Убедитесь что Laragon запущен." -ForegroundColor Red
    Write-Host "  Импортируйте БД вручную: mysql -u root -p < server\seed.sql" -ForegroundColor Gray
} else {
    Write-Host "  MySQL найден: $mysql" -ForegroundColor Green
}

# --- Шаг 3: Импорт БД ---
Write-Host "[3/8] Импорт базы данных..." -ForegroundColor Yellow
if ($mysql) {
    try {
        & $mysql -u root -e "source $WWW_DIR\server\seed.sql" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  База данных 'servicedesk' импортирована." -ForegroundColor Green
        } else {
            Write-Host "  Ошибка импорта. Возможно БД уже существует." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Ошибка: $_" -ForegroundColor Yellow
        Write-Host "  Импортируйте вручную: mysql -u root -p < $WWW_DIR\server\seed.sql" -ForegroundColor Gray
    }
} else {
    Write-Host "  Пропускаем (MySQL не найден)." -ForegroundColor Gray
}

# --- Шаг 4: Настройка .env ---
Write-Host "[4/8] Настройка .env..." -ForegroundColor Yellow
$envFile = "$WWW_DIR\server\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item "$WWW_DIR\server\.env.example" $envFile
    Write-Host "  server\.env создан из .env.example" -ForegroundColor Green
} else {
    Write-Host "  server\.env уже существует." -ForegroundColor Gray
}

# --- Шаг 5: Установка зависимостей ---
Write-Host "[5/8] Установка зависимостей..." -ForegroundColor Yellow
Set-Location $WWW_DIR
npm install --silent
if ($LASTEXITCODE -eq 0) { Write-Host "  Frontend зависимости установлены." -ForegroundColor Green }

Set-Location "$WWW_DIR\server"
npm install --silent
if ($LASTEXITCODE -eq 0) { Write-Host "  Backend зависимости установлены." -ForegroundColor Green }
Set-Location $WWW_DIR

# --- Шаг 6: Nginx vhost ---
Write-Host "[6/8] Настройка nginx vhost..." -ForegroundColor Yellow
$nginxConf = "$LARAGON_ROOT\etc\nginx\sites-enabled\servicedesk.conf"
if (-not (Test-Path $nginxConf)) {
    Copy-Item "$WWW_DIR\laragon\nginx\servicedesk.conf" $nginxConf
    Write-Host "  Nginx конфиг добавлен: tickets.test" -ForegroundColor Green
} else {
    Write-Host "  Nginx конфиг уже существует." -ForegroundColor Gray
}

# --- Шаг 7: Добавление в hosts ---
Write-Host "[7/8] Проверка hosts..." -ForegroundColor Yellow
$hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
$hostEntry = "127.0.0.1 tickets.test"
$hosts = Get-Content $hostsFile -Raw
if ($hosts -notmatch [regex]::Escape($hostEntry)) {
    try {
        $newHosts = $hosts.TrimEnd() + "`r`n" + $hostEntry + "`r`n"
        Set-Content $hostsFile $newHosts -Force
        Write-Host "  tickets.test добавлен в hosts." -ForegroundColor Green
    } catch {
        Write-Host "  Не удалось изменить hosts (запустите от администратора)." -ForegroundColor Yellow
        Write-Host "  Добавьте вручную: 127.0.0.1 tickets.test" -ForegroundColor Gray
    }
} else {
    Write-Host "  tickets.test уже в hosts." -ForegroundColor Gray
}

# --- Шаг 8: Итог ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Установка завершена!"                  -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Что делать дальше:"                      -ForegroundColor White
Write-Host "  1. Откройте Laragon > Меню > Nginx > Перезапустить Nginx"
Write-Host "  2. Запустите:    $WWW_DIR\запустить-все.bat"
Write-Host "     или вручную:  npm run dev  (frontend)"
Write-Host "                   cd server && npm run dev  (API)"
Write-Host ""
Write-Host "  Frontend: http://tickets.test  (или http://localhost:5173)"
Write-Host "  API:      http://localhost:4000"
Write-Host "  MySQL:    localhost:3306 (через Laragon)"
Write-Host ""
Write-Host "  Dev-логин: POST /api/auth/dev-login (без пароля)"
Write-Host "========================================" -ForegroundColor Cyan
