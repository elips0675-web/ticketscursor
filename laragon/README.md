# Service Desk + Laragon — пошаговая настройка

## Требования

- [Laragon](https://laragon.org/download/) (полная версия с Nginx)
- Node.js 18+ (скачать с [nodejs.org](https://nodejs.org/))
- Git (скачать с [git-scm.com](https://git-scm.com/))

---

## Установка (6 шагов)

### Шаг 1. Клонировать проект

```bash
cd C:\laragon\www
git clone https://github.com/elips0675-web/tickets.git
```

Или скопировать папку проекта в `C:\laragon\www\Tickets`.

### Шаг 2. Запустить Laragon

Откройте Laragon, нажмите **Start All**. Убедитесь что MySQL запущен (зелёная иконка).

### Шаг 3. Импортировать базу данных

```bash
cd C:\laragon\www\Tickets
mysql -u root -p < server\seed.sql
```

Пароль по умолчанию — пустой (просто Enter).

### Шаг 4. Настроить .env

```bash
copy server\.env.example server\.env
```

Убедитесь, что в `server\.env` указаны:
- `DB_HOST=localhost`
- `DB_USER=root`
- `DB_PASSWORD=` (пусто)
- `DB_NAME=servicedesk`

### Шаг 5. Установить зависимости

```bash
npm install
cd server && npm install && cd ..
```

### Шаг 6. Добавить Nginx vhost (чтобы работал tickets.test)

Скопируйте конфиг:

```bash
copy laragon\nginx\servicedesk.conf C:\laragon\etc\nginx\sites-enabled\
```

Добавьте в `C:\Windows\System32\drivers\etc\hosts`:

```
127.0.0.1 tickets.test
```

В Laragon: Меню → Nginx → Перезапустить Nginx.

---

## Запуск

### Вариант 1 — одной кнопкой

Запустите `запустить-все.bat` — сам установит зависимости, запустит серверы и откроет браузер.

### Вариант 2 — вручную

Откройте два терминала:

```bash
# Терминал 1 — Frontend (Vite)
cd C:\laragon\www\Tickets
npm run dev
# → http://localhost:5173 || http://tickets.test

# Терминал 2 — API (Express)
cd C:\laragon\www\Tickets\server
npm run dev
# → http://localhost:4000
```

---

## Доступ

| Адрес | Описание |
|-------|----------|
| http://tickets.test | Главная (через Nginx → Vite) |
| http://localhost:5173 | Frontend (Vite напрямую) |
| http://localhost:4000 | API (Express) |
| http://localhost:4000/api/health | Проверка API |

## Dev-логин

```bash
curl -X POST http://localhost:4000/api/auth/dev-login
```

Возвращает JWT-токен для пользователя id=1 (Алексей Петров, admin).

---

## Структура

```
C:\laragon\www\Tickets\
├── src/                  # React фронтенд
├── server/               # Express API
│   ├── seed.sql          # Схема + демо-данные
│   └── .env              # Конфиг подключения к БД
├── laragon/              # Файлы для Laragon
│   ├── nginx/            # Nginx vhost конфиг
│   ├── setup.ps1         # Скрипт автонастройки
│   └── README.md         # Эта инструкция
├── запустить-все.bat     # Быстрый запуск
└── Что сделано.txt       # Что сделано и что осталось
```
