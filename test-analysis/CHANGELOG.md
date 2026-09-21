# Changelog — Service Desk

> Все значимые изменения проекта документируются в этом файле.
> Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [1.9.0] — 2026-09-19

## [2.0.0] — 2026-09-21

### 📧 Email Ingestion UI (доделка)

- **Frontend** — `AdminSettings.tsx` ( ImapSection): IMAP настройки в админке — поля (host/port/user/pass), статус (настроен/не настроен, опрос активен/не активен), кнопка «Проверить соединение» (POST /api/admin/imap/test)
- **i18n** — 15 ключей `admin.imap*` в ru.json/en.json

### 🔗 Webhooks + API-токены (новая фича)

- **Backend** — `api-tokens.service.js`: SHA-256 hash токенов, prefix `sd_`, валидация, list, delete с проверкой владельца
- **Backend** — `webhooks.service.js`: 7 событий (ticket.created/updated/message/assigned/closed, employee.created/updated), HMAC SHA-256 подпись, retry 3 раза с exponential backoff
- **Middleware** — `authenticateToken` в `middleware.js`: принимает JWT **или** API-токены (`sd_...`)
- **Routes** — `api-tokens.js` (GET/POST/DELETE), `webhooks.js` (GET/POST/PUT/DELETE, admin-only)
- **Триггеры** — `tickets.js`: webhook вызывается при ticket.created, ticket.updated (status/priority), ticket.assigned, ticket.message, ticket.closed
- **Миграция** — `20260921_webhooks_api_tokens.sql`: таблицы `api_tokens` и `webhooks`
- **Prisma** — модели `api_tokens` и `webhooks` в `schema.prisma`
- **Frontend** — `AdminIntegrations.tsx`: компоненты `ApiTokensSection` и `WebhooksSection` с CRUD UI

### ⌨️ Command Palette (Cmd+K)

- **Frontend** — `CommandPalette.tsx`: диалог с поиском, навигация (11 страниц), быстрые действия (создать тикет, поиск), клавиши ↑↓ Enter Esc
- **i18n** — 6 ключей `commandPalette.*` в ru.json/en.json
- **App.tsx** — `CommandPalette` добавлен в корневой layout

### 🧹 Обновления

- **i18n** — добавлены `common.copy`, `common.disable`, `common.enable`
- **App.tsx** — импорт и рендер `CommandPalette`
- **AdminSettings.tsx** — импорт `ApiTokensSection`, `WebhooksSection`, `ImapSection`

### Тесты и сборка

- tsc: 0 ошибок ✅
- vite build: OK ✅
- ESLint: 0 ошибок (2 pre-existing warnings: react-hooks/set-state-in-effect)
- Коммиты: `80dcff2` (IMAP UI), `d85011a` (webhooks+tokens), `c703618` (command palette), `2c0a77d` (cleanup)

### 🔒 Collision Avoidance (новая фича)

- **Backend** — `collision.service.js`: acquireLock (30мин TTL), releaseLock, forceRelease, getLockStatus
- **Schema** — `locked_by` + `locked_at` на `tickets`, FK на `employees`, индекс `idx_tickets_locked_by`
- **Middleware** — проверка блокировки при `PUT /:id/status`, `/priority`, `/assign` (senior_agent+ может обходить)
- **API** — `POST /:id/lock`, `DELETE /:id/lock`, `POST /:id/force-unlock` (admin/senior_agent), `GET /:id/lock`
- **WebSocket** — `ticket:locked`/`ticket:unlocked` эмиты через outbox
- **Detail** — `getTicketById` возвращает `locked_by` и `locked_at`
- **Миграция** — `20260921_ticket_locking.sql`
- **i18n** — 9 ключей `admin.lock*` в ru.json/en.json

### 🔄 Recurring Tickets / Planовое ТО (новая фича)

- **Backend** — `recurrence.service.js`: CRUD + processRecurrences (cron-parser), auto-создание тикетов с префиксом «[Плановое]»
- **Schema** — `ticket_recurrences` (title, description, priority, category, assigned_to, cron_expr, next_run, is_active, last_run)
- **Routes** — `recurrences.js` (GET/POST/PUT/DELETE /api/recurrences, admin/senior_agent only), валидация cron-выражений
- **Background** — `processRecurrences()` каждые 60мин через BullMQ/setInterval в `background.js`
- **Миграция** — `20260921_ticket_recurrences.sql`

---

## [1.9.0] — 2026-09-19

### 📧 Email Ingestion (IMAP) — этап 1

- **Backend** — `email-ingestion.service.js`: IMAP polling (`imapflow`), парсинг писем (`mailparser`), создание тикетов из писем, поиск/создание employee по email, auto-reply «получили ваше письмо»
- **Миграция** — `024_email_ingestion.sql`: колонка `email_message_id` на `tickets` для thread-связки (In-Reply-To)
- **API** — `GET /api/admin/imap/status` (статистика писем), `POST /api/admin/imap/test` (проверка IMAP-соединения); IMAP-settings (`IMAP_HOST/PORT/USER/PASS`) в `ALLOWED_SETTINGS`
- **Background** — `startImapPolling()` + `stopImapPolling()` интегрированы в `background.js` (запуск при старте сервера, остановка при shutdown)
- **Тесты** — 15 unit-тестов `email-ingestion.service.test.js` (extractTicketReference, stripTicketReference, getImapConfig)
- **Global setup** — `vitest.global-setup.js` обновлён: `custom_field_definitions` + `custom_field_values` CREATE TABLE, `email_message_id` ALTER

### 🔄 API versioning (Этап 6 роадмапа)

- **Backend** — глобальный middleware в `app.js`: `req.url`/`req.originalUrl` с префиксом `/api/v1/` перезаписываются на `/api/` (единый mount `/api${prefix}`), каждый v1-запрос получает заголовок `X-API-Version: v1`; обратная совместимость с `/api/*` сохранена полностью
- **Фикс бага `cacheMiddleware`** — кэшируется только ответ со статусом <400 (раньше в кэш могли попадать 4xx/5xx); итоговая версия `cache.js` покрыта 6 unit-тестами

### ✨ ИИ-ассистент из Wiki (Этап 7 роадмапа)

- **Backend** — `assistant.service.js`: `extractKeywords` (RU/EN стоп-слова, нормализация), `searchWiki`, `buildAnswer` (шаблон со ссылками на статьи), `generateLlmAnswer` (OpenAI, 15s timeout) при `OPENAI_API_KEY`; гибридный ответ — LLM если ключ есть, иначе качественный шаблон
- **API** — `POST /api/tickets/:id/assistant` под `requireRole('admin','senior_agent','agent')`: ответ `{ success, data: { keywords, answer, usedLlm, sources } }`; swagger-документ добавлен
- **Frontend** — карточка «Ассистент» в `TicketDetail.tsx` (data-testid="assistant-card"): кнопка «Спросить ассистента», keywords-бейджи, ответ с источниками (ссылки на Wiki) и кнопкой «Вставить в сообщение» → заполняет поле отправки; видна только staff-ролям
- **i18n** — 7 ключей `tickets.assistant*` (ru/en)
- **Тесты** — MSW handler + 4 теста TicketDetail (показ для staff, ответ с источниками, вставка в сообщение, скрытие для requester)

### 🧹 Lint-очистка

- ESLint: **0 errors** (фикс пустых catch-блоков в `AdminCannedResponses.tsx`/`AdminSettings.tsx`, node-env для `scripts/check-bundle-size.js`, k6-глобалы в `test/load/*.k6.js`, убран неиспользуемый `keywords` в `assistant.service.js`); остаются только pre-existing warnings

- **Тесты** — сервер 436/436 (28 файлов), клиент 397/397 (52 файла); tsc чист, vite build OK, git diff не содержит ALTER TABLE

## [1.8.0] — 2026-09-18

### ⏱️ Time tracking (Этап 5 роадмапа)

- **Backend** — таблицы `time_entries` и `ticket_timers` (миграция `20260918_time_tracking.js`), колонка `tickets.time_spent_minutes`, Prisma-модели `TimeEntry`/`TicketTimer`
- **API** — `GET/POST /api/tickets/:id/time`, `DELETE /api/tickets/:id/time/:entryId`, `GET /api/tickets/:id/time/timer`, `POST /api/tickets/:id/time/timer/start|stop` (все под `requireRole('admin','senior_agent','agent')`); Zod-схемы: minutes 1..1440, description ≤500
- **time.service.js** — ручной ввод, таймер start/stop (стоп пишет запись из затраченных минут), удаление (владелец или senior_agent+), пересчёт `time_spent_minutes`
- **Frontend** — `TimeTrackingCard.tsx` в `TicketDetail`: итого «X ч Y мин», таймер с тиком 1с, форма добавления, список записей с удалением; скрыта для requester
- **i18n** — 18 ключей `tickets.time*` (ru/en)
- **Тесты** — сервер 413/413 (+19), клиент 393/393 (+4); tsc чист, vite build OK, lint 0 новых ошибок

## [1.4.0] — 2026-07-20

### 📧 Email Notification System

- **Email Templates UI** — `AdminSettings.tsx`: 8 шаблонов (create/status/priority/assign/message/SLA breach × subject/body), редактирование через textarea, кликабельные `{{variable}}` теги, кнопка сброса на дефолт
- **Backend validation** — `PUT /admin/settings` проверяет `EMAIL_TEMPLATES` на валидный JSON и наличие всех 8 ключей
- **SMTP from DB** — `email.js` читает SMTP_HOST/USER/PASS из `admin_settings` (БД), а не только из `.env`; пересоздаёт транспортер при изменении конфига
- **Startup warning** — предупреждение в лог, если SMTP не настроен
- **notifyPriorityChanged** — теперь шлёт email + in-app уведомления (раньше только Telegram)
- **notifyTicketMessage** — теперь шлёт email создателю и исполнителю (раньше только in-app + Telegram)

### 🐛 Исправлено

- **email.js + env mismatch** — SMTP-настройки из админ-панели (БД) реально используются при отправке писем; раньше `email.js` читал только `process.env`
- **notifyPriorityChanged** — не отправлял email и in-app уведомления (только Telegram)
- **notifyTicketMessage** — не отправлял email уведомления (только in-app + Telegram)

## [1.3.0] — 2026-07-20

### 🚀 Dead Letter Queue + Background Jobs Reliability

- **BullMQ DLQ** — `background.js`: `defaultJobOptions.attempts = 3`, exponential backoff (2s, 4s, 8s + jitter), failed jobs остаются для анализа
- **In-memory DLQ** (без Redis): `withRetry()` — 3 попытки + jitter, после исчерпания — запись в `event_outbox` с типом `dlq:<taskName>`
- **DLQ Alerting** — `checkDlqAlert()`: при > 10 DLQ-задач за час — email админам
- **QueueScheduler** — добавлен в bullMqMock для совместимости тестов

### 🗄️ Миграции

- **Idempotent polls migration** (`20260710_polls_enhance.js`) — проверяет существование колонок `ends_at`, `show_results` перед ALTER TABLE
- **last_active migration** (`20260720_add_last_active.js`) — добавляет `last_active TIMESTAMP NULL` в `employees` (для отслеживания онлайн-статуса)
- **Prisma Client** — регенерирован после миграций (19 моделей, +feature_flags)

### 🐛 Исправлено

- **VAPID try-catch** — `push.js` обёрнут `webpush.setVapidDetails()` в try-catch; без VAPID ключей — тихий fallback, не падает 500
- **QueueScheduler mock** — `background.expanded.test.js` добавлен `QueueScheduler` в bullMqMock (падал ReferenceError при тестах BullMQ)
- **Polls migration idempotent** — не падает при повторном запуске (column already exists)

### 🔧 Технический долг

- Bull Queue (background jobs) — ✅ DLQ реализован (см. PLAYBOOK.md #49)
- Добавлен `last_active` в Prisma schema employees model
- **Feature Flags (19-я модель Prisma)**: таблица `feature_flags`, `GET/PUT /api/admin/features`, хук `useFeature(key)`, UI в AdminSettings с toggle-переключателями, кэш 30с
- **Тесты**: +5 серверных (feature flags API), +5 клиентских (useFeature hook + AdminSettings toggles)
- **Кими-аудит**: зафиксированы оставшиеся gaps (email-шаблоны, WebSocket комнаты, bulk actions) — внесены в context.txt

## [1.2.0] — 2026-07-17

### 🚀 Admin Operations

- **Redis** — страница `/admin/settings` показывает статус Redis, позволяет ввести/изменить `REDIS_URL`
- **Backup** — кнопка "Сделать бэкап" запускает `scripts/backup-mysql.ps1` (mysqldump + retention 7 дней)
- **Seed** — кнопка "Запустить db:seed" генерирует тестовые данные из админки
- **Geo / Migration** — кнопка для запуска FULLTEXT миграции
- **API** — `POST /admin/settings/backup`, `POST /admin/settings/seed`, `GET/PUT /admin/settings/redis-status`, `GET/PUT /admin/settings/redis`
- **i18n** — добавлены переводы для 4 операций (ru/en)

### 🔧 Технический долг

- i18n: добавлен `common.add` (ru/en)

## [1.1.0] — 2026-07-17

### 🚀 Добавлено (merge from ticketscursordom)

- **Outbox Pattern** — `event_outbox` таблица + Worker для гарантированной доставки WS-событий
- **Soft Delete** — `deleted_at` колонки на tickets, ticket_messages, files, chat_messages
- **Load Testing** — k6 сценарии в `k6/` (tickets, chats, search)
- **Grafana Dashboard** — метрики API, WebSocket, Redis, бизнес-показатели
- **Health / Readiness Probes** — `/api/health`, `/api/ready` для K8s
- **Bundle-size check** — CI проверка размера сборки (лимит 2MB)
- **a11y** — `prefers-reduced-motion` для вестибулярных пользователей
- **CSP strict** — Helmet connect-src с `http://localhost:*` для dev-режима
- **Graceful Shutdown** — SIGTERM/SIGINT обработчики (close DB, stop timers)

### 🐛 Исправлено

- **MySQL не запускался** — перезапущен Laragon, MySQL поднят
- **Prisma client устарел** — `npx prisma generate` после мержа (не хватало `deleted_at`, `event_outbox`, `last_active`)
- **500 на всех API** — добавлены колонки `deleted_at` в tickets/ticket_messages/files/chat_messages, создана таблица `event_outbox`, добавлена колонка `last_active` в employees
- **Null id в консоли** — guard `if (!raw) return` в ticket-context.tsx и `if (chat) navigate(...)` в Employees.tsx
- **Документация** — context.txt и PLAYBOOK.md синхронизированы с паттернами из Промты.txt

### 🔧 Технический долг

- Добавлено `last_active` в Prisma schema employees model
- Prisma моделей: 17 → 18 (+ event_outbox)

## [1.0.0] — 2026-07-10

### 🎉 Релиз production-ready версии

---

### 🔐 Инфраструктура и безопасность

- **Prisma ORM** — полная замена ручных SQL-запросов
  - 17 моделей с типобезопасностью
  - Все `knex.raw()` заменены на `prisma.$queryRaw` / `prisma.model.findMany`
  - Миграции через Knex (FULLTEXT + refresh_tokens) + Prisma Migrate

- **Zod валидация** — 15 схем на всех API роутах
  - `auth`, `tickets`, `wiki`, `polls`, `news`, `admin`, `calendar`, `chats`, `employees`, `files`, `search`, `push`, `notifications`
  - Централизованные `validate()` и `validateQuery()` middleware

- **JWT + Refresh токены**
  - Access: 15 минут (Bearer в заголовке)
  - Refresh: 7 дней (httpOnly cookie)
  - Endpoint `/api/auth/refresh` для обновления access

- **RBAC — 5 ролей с иерархией**
  - `super_admin` > `admin` > `senior_agent` > `agent` > `requester`
  - `hasRole()` utility — иерархическая проверка
  - `super_admin` проходит ВСЕ проверки
  - `requireRole()` middleware на защищённых роутах
  - `ProtectedRoute` + скрытие UI по роли на фронтенде
  - `requester`: видит только свои тикеты, дашборд и профиль

- **Rate Limiting**
  - Auth: 10 запросов/60с
  - API: 100 запросов/60с
  - Admin: 30 запросов/60с

- **Helmet + CORS**
  - Security headers через helmet
  - CORS whitelist origins

- **Winston логирование**
  - Уровни: error, warn, info, debug
  - Транспорты: console + error.log + combined.log
  - Ротация: 10MB, 5 файлов
  - `requestId` middleware (UUID + X-Request-Id)

- **Docker**
  - Multi-stage Dockerfile (node:20-alpine)
  - Non-root USER node
  - docker-compose: mysql 8.4 + mysql_replica + redis + api + frontend (nginx) + prometheus + grafana + meilisearch
  - Healthcheck для всех сервисов
  - `seed.sql` инициализация
  - MySQL репликация (primary/replica) + ежедневные mysqldump бэкапы
  - Meilisearch для fuzzy search (опционально, fallback FULLTEXT → LIKE)

- **Graceful shutdown**
  - Обработка SIGTERM/SIGINT
  - Закрытие HTTP сервера + Socket.IO + Prisma connection

### 🔄 React Query + Optimistic Updates (Этап G)

- **@tanstack/react-query v5.101.0**
  - `QueryClientProvider` в `App.tsx` с ленивой инициализацией
  - `ticket-context.tsx` переписан на `useQuery`/`useMutation`

- **Optimistic Updates**
  - `createTicket`: немедленное добавление в список с `onMutate`
  - `addMessage`: мгновенное отображение сообщения
  - `updateTicketStatus`, `updateTicketPriority`, `assignTicket`: rollback при ошибке
  - Все мутации с `onSettled: () => queryClient.invalidateQueries`

### 🧪 Клиентские тесты 47 → 71+ (Этап I)

- 9 новых тестовых файлов:
  - `NewTicket.test.tsx`, `Register.test.tsx`, `Files.test.tsx`
  - `ForgotPassword.test.tsx`, `ResetPassword.test.tsx`
  - `Kanban.test.tsx`, `AdminDashboard.test.tsx`
  - Дополнительные тесты Dashboard
- Исправлен баг: `Badge` import в `Chats.tsx`
- MSW handlers расширены: ticket mutations, admin stats, register, files

### 🏗️ Инфраструктура docker-compose (Этап J)

- **mysql_backup** volume для бэкапов БД
- **Healthcheck** для `api` (wget /api/health) и `frontend` (wget /)
- **Prometheus** (prom/prometheus) + **Grafana** (grafana/grafana)
- `monitoring/` директория: prometheus.yml, grafana datasource + dashboard providers
- `GET /api/metrics` endpoint на сервере (prometheus text format)

### 🧩 Новые модули и улучшения (Этапы E, F, H)

- **SLA Policy Matrix** — учёт категории (incident/bug/support/feature) × приоритет для вычисления дедлайна
  - `GET /api/tickets/sla/stats` — статистика соблюдения SLA для админ-дашборда
  - Карточка SLA в админке (on time / overdue / no SLA / compliance rate)

- **Роль Requester** — пятая роль в иерархии RBAC
  - Доступ: только свои тикеты, дашборд, поиск, профиль
  - Серверная фильтрация `listTickets` по `created_by`
  - `requireRole('agent')` на chats/employees/calendar/polls/wiki/news/files
  - Скрытие недоступных разделов в sidebar и мобильной навигации

- **Skeleton Loaders** — каркасы загрузки для всех списковых экранов
  - Tickets, News, Wiki, Files, Chats, Polls, Employees
  - Компоненты: `SkeletonCard`, `SkeletonCardGrid`, `SkeletonTableRow`, `SkeletonChatRow`

- **Тесты** — серверные расширены с 17 до 93 тестов
  - 4 новых сервисных теста (chats, employees, news, calendar)
  - `api.test.js`: auth, RBAC, валидация, push, search, уведомления

### 💬 Real-time (WebSocket)

- **Socket.IO интеграция**
  - JWT-аутентификация на handshake
  - Комнаты: `chat:{id}`, `ticket:{id}`, `employee:{id}`, `online`
  - Эмиты: `message:new`, `message:removed`, `ticket:created`, `ticket:updated`, `ticket:message`

- **Чаты**
  - Общие и личные чаты
  - Отправка/удаление сообщений в реальном времени
  - Поиск по чатам и внутри чата
  - Реакции (эмодзи)
  - Непрочитанные сообщения (бейдж)
  - Пагинация истории (50 сообщений)

- **Rate limiting WebSocket**
  - 5 сообщений/сек
  - Exponential backoff (×2, max 60s)

- **Redis adapter**
  - `@socket.io/redis-adapter` при `REDIS_URL`
  - Fallback на in-memory (масштабируемость на 1 ноду)

### 📁 Файловое хранилище

- **Multer + валидация**
  - Лимиты: files 50MB, wiki 10MB, tickets 20MB
  - `fileFilter` по MIME-типам (запрет .exe/.js/.html)
  - Magic bytes проверка (file-type)

- **Storage Adapter Pattern**
  - S3/MinIO при `S3_ENDPOINT`
  - Локальный диск fallback
  - Presigned URL для загрузки/скачивания

- **ClamAV**
  - Опциональное сканирование (`CLAMAV_ENABLED=true`)
  - Интеграция в `validateUpload`

### 🎫 Тикеты

- **CRUD + статусы**
  - `open` → `in_progress` → `resolved` → `closed`
  - Приоритеты: low / medium / high / critical

- **SLA**
  - `due_at` при создании
  - `first_response_at` при первом `in_progress`
  - `resolved_at` при `resolved`/`closed`
  - Сброс `resolved_at` при `reopened`

- **Автоназначение (AUTO_ASSIGN)**
  - Выбор наименее загруженного `agent`/`senior_agent`
  - Переписан на чистый Prisma (без raw SQL)

- **SLA-мониторинг**
  - `GET /api/tickets/sla/overdue` (admin/senior_agent)
  - Фоновая проверка каждые 15 минут
  - Эскалация: in-app / email / telegram
  - Дедупликация 24 часа

- **Чат внутри тикета**
  - Внутренние заметки (`isInternal`)
  - Пагинация сообщений (`GET /:id/messages` с `take/skip`)

- **Вложения**
  - Multer → uploads/tickets/
  - WebSocket-эмиты изменений

- **Экспорт**
  - CSV (UTF-8 BOM) на всех страницах
  - PDF (jsPDF + html2canvas) на тикетах

### 🔍 Глобальный поиск

- **FULLTEXT INDEX**
  - `MATCH ... AGAINST` по 6 таблицам
  - Fallback на `LIKE` при ошибке FULLTEXT

- **UI**
  - `Ctrl+K` горячая клавиша
  - Боковое меню поиска
  - Группировка результатов по разделам

### 🔔 Уведомления

- **Единый сервис `notify.js`**
  - In-app + Email + Telegram + Web Push
  - Автотриггеры: создание, статус, приоритет, назначение, сообщение

- **Email (nodemailer)**
  - Настраиваемый транспорт через админку

- **Telegram (node-telegram-bot-api)**
  - Бот, настраиваемый токен/канал через админку

- **Web Push**
  - VAPID ключи
  - Подписка/отписка
  - PWA + service worker

- **Автоочистка**
  - Удаление уведомлений старше 90 дней (каждые 6 часов)

### 👥 Сотрудники

- **Список**
  - Онлайн-статус (WebSocket)
  - Поиск, фильтр по роли/отделу
  - Карточки / таблица (Radix Tabs)
  - CSV экспорт (UTF-8 BOM)

### 📚 Wiki / Новости / Календарь / Опросы

- **Wiki**
  - Статьи, категории, поиск
  - Загрузка изображений (multer → uploads/wiki/)
  - CSV экспорт

- **Новости**
  - Лента с фильтром «Важные»
  - Создание (senior_agent+)
  - Серверная пагинация
  - CSV экспорт (лимит 10 000)

- **Календарь**
  - Сетка с навигацией по месяцам
  - Создание/удаление событий
  - Ближайшие события (виджет)
  - CSV экспорт

- **Опросы**
  - Список, создание, голосование
  - Прогресс-бары результатов
  - Исправлен N+1 (IN() вместо цикла)

### 🎛️ Админ-панель

- Дашборд статистики
- Управление пользователями (роли, блокировка)
- Push-уведомления (подписка/отправка)
- Настройки интеграций (email, telegram, LDAP)
- Аудит действий

### 🔐 LDAP / Active Directory

- **ldapjs**
  - Bind + search
  - Настройка через админку
  - `POST /api/auth/ldap-login`
  - Auto-provisioning сотрудника при первом входе

### 🧪 Тестирование

- **Клиентские тесты**
  - 71 тест, 23 файла
  - Vitest + jsdom + MSW
  - ✅ Все пройдены

- **Серверные тесты**
  - 93 теста, 5 файлов
  - Vitest + Supertest
  - 4 сервисных теста: chats, employees, news, calendar
  - ✅ Все пройдены

- **E2E (Playwright)**
  - 5 файлов: login, tickets, chats, admin, sla-autoassign-export
  - 14 тестов

- **Coverage (v8)**
  - Пороги: statements 20%, branches 15%, functions 15%, lines 25%

### 🛡️ Error Boundaries

- **Модульные ErrorBoundary** — каждая страница обёрнута в `<ErrorBoundary>`
  - Крах одного модуля не ломает другие
  - UI: кнопка «Перезагрузить», сообщение об ошибке, stack trace

### 📧 Retry-логика email

- **Экспоненциальный backoff** (×2, max 10s, до 3 попыток)
- `retryWithBackoff()` + `safeSend()` — все email-уведомления защищены
- Логирование каждой попытки через `logger.warn`

### 🐳 Dockerfile улучшен

- `prisma generate` в build stage
- `wget` добавлен для healthcheck
- Prisma schema скопирована в production образ

### 🔄 CI/CD

- **GitHub Actions**
  - Линтинг, typecheck, сборка, серверные тесты
  - Поднятие MySQL 8.4 + seed.sql

- **Husky + lint-staged**
  - Pre-commit хуки

### 📱 PWA

- `injectManifest`
- Кастомный service worker
- Push-уведомления (web-push)
- Install prompt (`beforeinstallprompt`)

### 🖥️ Десктоп (Tauri)

- Конфигурация
- Rust-заглушка

### 🌐 i18n

- Русский / Английский
- `LanguageDetector` + переключатель
- Полные переводы на всех страницах

### ♿ Доступность (a11y)

- Нижняя мобильная навигация
- Тёмная тема
- `htmlFor/id` на всех формах
- Error messages с `role="alert"`
- `aria-label` на icon-only кнопках
- Keyboard + `role="button"` + `tabIndex` на кликабельных карточках
- Radix Tabs (Employees)
- Dropzone с клавиатурной a11y

### 📋 Внешний аудит (Kimi AI)

- Проведён комплексный внешний аудит кода и архитектуры — **общая оценка 7.7/10**
- Большинство рекомендаций выполнено в рамках предыдущих этапов

---

## [0.9.0] — 2026-06-15

### Code Review Fixes (Этап 24)

- ✅ Формат API-ответов — убраны spread-операторы
- ✅ Уведомления — все `notify*` с `await` + `try/catch`
- ✅ Сервисный слой — `updatePriority`/`updateAssign` вынесены
- ✅ Права чтения — `GET /:id` проверяет `canView`
- ✅ `hasRole()` утилита — иерархическая проверка
- ✅ `getLeastLoadedAssignee` — переписан на чистый Prisma
- ✅ Пагинация сообщений — `listTickets` без сообщений, `getTicketById` с `take/skip`
- ✅ `getResolvedAt` — сброс в `null` при `reopened`
- ✅ `createTicket` — fallback настроек
- ✅ `crypto.randomUUID()` — вместо `Math.random()`
- ✅ Логирование — `logger.error` во всех `catch`
- ✅ Проверка тикета — `POST /:id/messages` проверяет существование

---

## [0.8.0] — 2026-05-20

### Унификация и сервисный слой (Этапы C-D)

- ✅ Унификация API-ответов во всех роутах
  - Единый формат: `{ success, data }` / `{ success: false, message }`
  - Обновлён фронтенд: извлечение `.data` из ответов

- ✅ Сервисный слой для всех модулей
  - `chats.service.js`, `files.service.js`, `polls.service.js`
  - `wiki.service.js`, `news.service.js`, `employees.service.js`, `calendar.service.js`
  - Роуты переписаны: импорт сервисов, тонкие контроллеры

---

## [0.7.0] — 2026-04-10

### Инфраструктура (Этапы A-B)

- ✅ Убран DEMO-fallback при ошибках API
- ✅ Graceful shutdown (SIGTERM/SIGINT)
- ✅ Docker + docker-compose
- ✅ Kubernetes manifests
- ✅ Vercel конфигурация (SPA routing)

---

## [0.1.0] — 2026-01-15

### Начало проекта

- Базовый стек: React 18 + Express + MySQL
- Модули: Дашборд, Тикеты, Сотрудники, Календарь, Опросы, Файлы, Чаты, Профиль, Авторизация
- Проблемы: нет ORM, нет WebSocket, нет RBAC, нет Docker, dev-логин без пароля

---

## 📋 План развития

### Этап E — SLA Policy Matrix ✅
- [x] Деадлайны по категориям (bug/feature/support/incident) + приоритетам
- [x] Отчётность по SLA в админ-дашборде

### Этап F — Роль Requester ✅
- [x] `role: 'requester'` — видит только свои тикеты
- [x] `ProtectedRoute` + middleware проверка на всех роутах

### Этап G — TanStack Query ✅
- [x] Установка `@tanstack/react-query` v5.101.0
- [x] Замена `fetch` в `ticket-context` на `useQuery/useMutation`
- [x] Optimistic updates (createTicket, addMessage, updateStatus/priority/assign)

### Этап H — Skeleton Loaders ✅
- [x] Tickets, News, Wiki, Files, Employees, Chats, Polls
- [x] Компонент `src/components/skeletons.tsx`

### Этап I — Покрытие тестов 50%+ ✅
- [x] Серверные: 17 → 93 теста (5 файлов, 4 сервисных)
- [x] Клиентские: 47 → 71 (23 файла)
- [x] E2E: эскалация SLA, автоназначение, экспорт (e2e/sla-autoassign-export.spec.ts)

### Этап J — Инфраструктура ✅
- [x] mysql_backup volume для бэкапов
- [x] Healthcheck для api и frontend
- [x] Prometheus + Grafana с provisioning

### 🛡️ Error Boundaries ✅
- [x] `<ErrorBoundary>` на всех 23 страницах

### 📧 Retry email ✅
- [x] Exponential backoff в notify.js

### 🐳 Dockerfile ✅
- [x] Prisma generate, wget, multi-stage

### 🗄️ MySQL Read Replica + Backups ✅
- [x] `mysql_replica` — сервис с `server_id=2`, `read_only=1`, порт 3308
- [x] `mysql/primary.cnf` — binlog, `server_id=1`
- [x] `mysql/replica.cnf` — relay_log, `read_only=1`
- [x] `mysql/init-replica.sh` — автонастройка репликации при старте
- [x] `db_backup` — alpine-контейнер: mysqldump ежедневно, хранение 7 дней

### ⚙️ BullMQ — фоновые задачи (Этап K1) ✅
- [x] Установлен `bullmq`, создан `server/src/background.js`
- [x] При `REDIS_URL`: BullMQ Queue + Worker с repeatable jobs (SLA каждые 15 мин, cleanup каждые 6 ч)
- [x] Без Redis: setInterval fallback (как было)
- [x] Graceful shutdown через закрытие очередей

### 🗄️ Cache race condition fix (Этап K2) ✅
- [x] Redis `invalidate()` переписан на Lua-скрипт (атомарное `keys` + `del`)
- [x] Устранена гонка между `delPattern` и новыми записями

### 🔖 API versioning (Этап K3) ✅
- [x] Все роуты доступны по `/api/v1/...` в дополнение к `/api/...`
- [x] `/api/...` сохранён для обратной совместимости
- [x] `/api/v1/docs` + `/api/docs` — Swagger

### 🐛 Исправление импортов в Chats.tsx
- [x] `Hash` — добавлен в импорт из lucide-react
- [x] `Avatar`, `AvatarFallback` — добавлен импорт из shadcn/ui

### 🧪 E2E: globalSetup + storageState
- [x] `e2e/global-setup.ts` — единая авторизация для всех тестов
- [x] `playwright.config.ts` — storageState + globalSetup
- [x] Все тесты переписаны: 14/14 проходят
- [x] `check-console.mjs` — скрипт быстрой проверки 6 страниц

### 🔧 search-sync.js
- [x] `MeiliSearch` → `Meilisearch` (неверное имя экспорта)

### 🔍 Meilisearch Fuzzy Search ✅
- [x] `meilisearch` сервис в docker-compose (v1.8, порт 7700)
- [x] `search-sync.js` — fullSync при старте + syncEntity для CRUD
- [x] 6 индексов: tickets, employees, wiki, news, chats, files
- [x] Прозрачный fallback: Meilisearch → FULLTEXT → LIKE
- [x] `MEILISEARCH_URL` + `MEILI_MASTER_KEY` в env

### Этап K1 — BullMQ ✅
- [x] Замена `setInterval` на BullMQ очереди (SLA, cleanup)
- [x] Fallback на setInterval при отсутствии Redis

### Этап K2 — Cache race condition ✅
- [x] Атомарная инвалидация кэша через Lua-скрипт

### Этап K3 — API versioning ✅
- [x] `/api/v1/*` + обратная совместимость `/api/*`

---

*Автор: [elips0675-web](https://github.com/elips0675-web)*
*Репозиторий: [ticketscursor](https://github.com/elips0675-web/ticketscursor)*
