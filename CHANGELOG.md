# Changelog — Service Desk

> Все значимые изменения проекта документируются в этом файле.
> Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

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
