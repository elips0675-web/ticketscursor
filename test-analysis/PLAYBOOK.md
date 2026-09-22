# Service Desk — Production Playbook

> Чек-лист production-паттернов. ✅ = есть, ❌ = нет, ➕ = запланировано.

---

## 🏗️ Архитектура

### 24. State Management
✅ **React Query** для server state, **React Context** для client-only (auth, тема)
- Никакого useState/Context для данных с сервера
- `ticket-context.tsx` — только UI-состояние (фильтры, пагинация), данные через useQuery

### 25. Error Handling
✅ **Backend**: `app.js` — global error handler (winston + 500), Sentry при SENTRY_DSN
✅ **Frontend**: `ErrorBoundary.tsx` — class-based, обёрнут каждый lazy-роут
- API-ошибки: `{ message: "Human readable" }` формат во всех роутах

### 26. Request Validation
✅ **Zod v4**: 12+ схем в `server/src/schemas.js` — `validate()` middleware на всех роутах
- Все поля типизированы, сообщения на русском
- `validateQuery()` для query-параметров (пагинация, поиск)

---

## 🚀 Performance

### 27. Performance Budget (цели)
```
First Contentful Paint: < 1.5s
Lighthouse Performance:  > 85
Initial JS bundle:       < 200 KB gzip (текущий: 1.2 MB raw / ~350 KB gzip)
Total JS bundle:         < 500 KB gzip (текущий: 640 KB gzip)
API response time (p95): < 500ms
```
✅ **CI проверка**: `node scripts/check-bundle-size.js` в CI после `vite build`
✅ Code splitting (React.lazy) на части страниц
✅ Virtual scrolling (`@tanstack/react-virtual`) в чатах и сообщениях тикетов
⚠️ **index chunk 1.2 MB raw** — главная проблема производительности. План:
```js
// 1. Вынести React, ReactDOM, react-router-dom в vendor chunk (manualChunks)
// 2. Убедиться, что ВСЕ страницы — React.lazy (сейчас не все)
// 3. Крупные libs (html2canvas, jspdf) — динамический импорт только на страницах экспорта
// 4. Проверить recharts — возможно tree-shake не работает
```

### 28. PWA
✅ `vite-plugin-pwa` + `public/sw.js` (Workbox)
✅ Push-уведомления (`use-push.ts`)
✅ Install prompt (`pwa-install-prompt.tsx`)

### 29. Images
⚠️ Нет стратегии responsive images (проект не image-heavy — только аватары)
- Аватары загружаются как есть, без WebP/AVIF конвертации

### 13. Loading States
✅ **Skeleton-компоненты** (`skeletons.tsx`): Card, CardGrid, TableRow, ChatRow
✅ Используются на всех списковых страницах (Tickets, Wiki, News, Polls, Files, Employees, Chats)
✅ `Loader2` (spinner) только для кнопок действий

---

## ♿ Accessibility

### 30. a11y Checklist
- [x] `aria-label` на icon-only кнопках (Search, Send, Back, Close, Delete)
- [x] `role="button"` + `tabIndex` + `onKeyDown` (Enter/Space) на всех кликабельных карточках
- [x] `role="alert"` на сообщениях об ошибках форм
- [x] Focus visible (браузерный outline сохраняется)
- [x] Skip-to-content link (app-layout + admin-layout)
- [x] `aria-live="polite"` в app-layout (скрытый регион для динамики)
- [x] `aria-label` на всех `<nav>` (sidebar, mobile-bottom-nav, admin-nav)
- [ ] Touch target ≥ 44×44px (мобильная навигация)
- [ ] `prefers-reduced-motion` — убрать анимации

---

## 🗄️ Database

### 32. Query Optimization
✅ Индексы на все foreign keys и частые WHERE (seed.sql, 15 индексов)
✅ N+1 отсутствует — Prisma `include` / `_count` select
✅ Пагинация offset-based (админка) + cursor-based (чаты)

### 33. Soft Deletes
✅ **Реализовано**: `deleted_at` на tickets, ticket_messages, chat_messages, files.
- `prisma.delete` → `prisma.update({ data: { deleted_at: new Date() } })`
- Все SELECT с `where: { deleted_at: null }`
- Админы могут найти удалённые записи по ID (findUnique без фильтра)
➡️ Для production нужно:
```sql
ALTER TABLE tickets ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE chat_messages ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE files ADD COLUMN deleted_at TIMESTAMP NULL;
-- Все SELECT с WHERE deleted_at IS NULL
```
➕ Приоритет: средний

### 11. Database Indexes
✅ 15 составных индексов + FULLTEXT на search-таблицах
✅ Индексы на `created_at` для сортировки

---

## 🔐 Security

### 4. CSP / Helmet
✅ Helmet 8 со стандартными заголовками
⚠️ CSP не кастомизирован (default-src 'self' от Helmet)
✅ **Strict CSP настроен** в Helmet:
```
default-src 'self';
script-src 'self' 'nonce-{random}';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self' ws://localhost:4000;
```

### 36. Rate Limiting
✅ **HTTP**: Auth 10/min, API 100/min, Admin 30/min (express-rate-limit)
✅ **WebSocket**: 5 msg/sec/socket + exponential backoff
✅ Rate limiter отключается в тестах (`NODE_ENV=test`)

### 37. CORS
✅ Настроен через env (CORS_ORIGIN), fallback на localhost
✅ `credentials: true`

### 38. Secrets Management
✅ `server/.env.example` с инструкциями по генерации ключей
✅ `.env` в `.gitignore`
✅ JWT_SECRET, VAPID keys в .env

---

## 📊 Observability

### 39. Structured Logging
✅ **Winston JSON** — `server/src/logger.js`
- Console + file (error.log, combined.log)
- Ротация 10MB, 5 файлов
- requestId через middleware

### 40. Health Checks
✅ `GET /api/health` — `{ status: 'ok', timestamp }`
✅ Используется в docker-compose healthcheck
⚠️ Нет разделения readiness / liveness

### 41. Graceful Shutdown
✅ `server/src/index.js` — SIGTERM/SIGINT обработчик:
```js
async function shutdown(signal) {
  await new Promise(resolve => server.close(resolve))
  await prisma.$disconnect()
  await stopBackgroundJobs()
  process.exit(0)
}
```

### 1. Audit Log
✅ `server/src/audit.js` — `auditLogMiddleware` + `logAudit()`
✅ Таблица `audit_log` с миграцией
✅ Логируются: create, update, delete на всех основных сущностях

---

## 🧪 Testing

### 42. Testing Pyramid
```
Unit (business logic):    372 frontend + 352 backend = 724 tests
Integration (API routes): покрыто в api.test.js (145 тестов)
E2E (critical flows):     14 Playwright spec'ов
```
✅ Пороги coverage: frontend 71% stmts, backend 71% stmts

### 43. Visual Regression
❌ Не реализовано (Chromatic/Loki)
➡️ Низкий приоритет — проект без дизайн-системы

---

## 🔄 DevOps

### 45. Docker
✅ Multi-stage Dockerfile (frontend: nginx, backend: node:22-alpine)
✅ docker-compose: mysql, meilisearch, api, frontend, prometheus, grafana
✅ Healthcheck на всех сервисах

### 46. CI/CD
✅ GitHub Actions: lint → typecheck → test → build
✅ MySQL service container для серверных тестов
✅ Кэширование node_modules

### 47. Database Migrations
✅ Knex.js, 11 миграций, auto-run на старте
✅ `up()` / `down()` паттерн
✅ Только additive changes (никаких DROP в одном PR с CREATE)

---

## ➕ Что добавить в первую очередь

| # | Паттерн | Приоритет | Усилия | Эффект |
|---|---------|-----------|--------|--------|
| 33 | Soft Deletes | ✅ Реализовано | — | Tickets, ticket_messages, chat_messages, files |
| 34 | Idempotency Keys | ✅ Реализовано | — | POST /chats/:id/messages, /tickets, /tickets/:id/messages |
| 54 | Readiness Probe | ✅ Реализовано | — | GET /api/health/ready проверяет DB |
| 30 | a11y: skip-link, aria-live | ✅ Реализовано | — | skip-link + aria-live + aria-label на nav |
| 55 | Load Testing (k6) | ✅ Реализовано | — | 2 скрипта: чат + тикеты |
| 27 | Performance Budget в CI | ✅ Реализовано | — | `scripts/check-bundle-size.js` в CI |
| 53 | Grafana Dashboard | ✅ Реализовано | — | 6 панелей: rate, duration, memory, CPU, event loop |
| 4 | Strict CSP | ✅ Реализовано | — | Helmet с кастомными директивами |
| 48 | Outbox Pattern | ✅ Реализовано | — | enqueueEvent + worker (100ms poll) |
| 49 | Dead Letter Queue | ✅ Реализовано | — | BullMQ retry+DLQ + in-memory withRetry+DLQ |
| 27a | Bundle size (1.2 MB index chunk) | 🔴 | 2ч | FCP с 1.5s → < 1s |
| 49 | Bull Queue (background jobs) | ✅ DLQ | — | BullMQ retry+DLQ + in-memory withRetry+DLQ |
| — | N+1 Query Audit | 🟠 | 1ч | Стабильность API под нагрузкой |
| — | Index Audit + FULLTEXT | 🟠 | 1ч | Скорость поиска |
| 29 | Feature Flags | ✅ | — | useFeature() hook + admin UI + 30s cache |
| 52 | API Versioning | 🟢 | 2ч | Безопасные breaking changes |
| — | Email-шаблоны в админке | 🟡 | 3ч | Настраиваемость системы |
| — | Audit log CSV экспорт | 🟡 | 1ч | Compliance/безопасность |
| — | WebSocket комнаты ticket:{id} | 🟡 | 2ч | Реалтайм-обновления тикета |
| — | Bulk actions | 🟡 | 2ч | UX массовых операций |
| — | Canned responses | 🟡 | 2ч | Скорость ответа агентов |
| — | prefers-reduced-motion | 🟢 | 15мин | a11y |
| — | Tags/labels на тикетах | 🟢 | 2ч | Категоризация |
| — | Mentions (@username) | 🟢 | 1ч | Удобство коммуникации |
| — | Time tracking | 🟢 | 2ч | Учёт трудозатрат |

---

## 🔧 Idempotency Keys — реализация

```js
// server/src/middleware/idempotency.js
import { cache } from '../cache.js'

const TTL = 86400

export function idempotent(req, res, next) {
  const key = req.headers['idempotency-key']
  if (!key) return next()

  const cacheKey = `idempotency:${req.user?.userId || 'anon'}:${key}`

  cache.get(cacheKey).then(cached => {
    if (cached) return res.json(cached)

    const originalJson = res.json.bind(res)
    res.json = (body) => {
      cache.set(cacheKey, body, TTL).catch(() => {})
      originalJson(body)
    }
    next()
  }).catch(() => next())
}
```

Middleware добавлена на: `POST /api/chats/:id/messages`, `POST /api/tickets/`, `POST /api/tickets/:id/messages`.

---

## 🔧 Soft Deletes — реализация

```js
// server/migrations/20260716_add_soft_delete.js
export function up(knex) {
  return knex.schema
    .alterTable('tickets', table => {
      table.timestamp('deleted_at').nullable()
    })
    .alterTable('chat_messages', table => {
      table.timestamp('deleted_at').nullable()
    })
    .alterTable('files', table => {
      table.timestamp('deleted_at').nullable()
    })
}

export function down(knex) {
  return knex.schema
    .alterTable('tickets', table => table.dropColumn('deleted_at'))
    .alterTable('chat_messages', table => table.dropColumn('deleted_at'))
    .alterTable('files', table => table.dropColumn('deleted_at'))
}
```

Сервисы обновить: все `findMany`/`count` с `where: { deleted_at: null }`.
`DELETE` → `update({ data: { deleted_at: new Date() } })`.

---

## 📡 Monitoring & Observability

### 53. Prometheus + Grafana (уже в docker-compose)

```yaml
# docker-compose.yml — сервисы уже есть:
prometheus:
  image: prom/prometheus
  volumes: ['./prometheus.yml:/etc/prometheus/prometheus.yml']
  
grafana:
  image: grafana/grafana
  ports: ['3000:3000']
```

**Метрики**: `GET /api/metrics` (Prometheus format) — request duration, memory, event loop lag.
**Дашборды**: Grafana на localhost:3000, admin/admin.
✅ **Дашборд создан**: `monitoring/grafana/dashboards/api-metrics.json` — 6 панелей:
- Request Rate (by route), Avg Response Time, P95 Response Time
- Memory (RSS + Heap), CPU, Event Loop Lag
- Автопровайдинг при старте Grafana через docker-compose.

### 54. Readiness Probe (/health/ready)

```js
// Отличается от /health (liveness):
// /health/live — сервер запущен (always 200)
// /health/ready — DB + Redis + S3 доступны (200/503)
app.get('/api/health/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', db: true })
  } catch {
    res.status(503).json({ status: 'error', db: false })
  }
})
```

✅ **Реализовано:** `GET /api/health/ready` — проверяет DB + возвращает 200/503.

### 55. Load Testing (k6)

✅ **Созданы скрипты** в `test/load/`:
- `chat.k6.js` — отправка сообщений (50→100 concurrent, порог ошибок < 5%)
- `tickets.k6.js` — список + создание тикетов (100→200 concurrent, порог < 1%)
- `README.md` — инструкция: `k6 run -e TOKEN=$TOKEN test/load/chat.k6.js`

Пороги p(95) < 500ms для чата, < 1s для тикетов.

---

## 🔩 Reliability Patterns

### 48. Outbox Pattern (events reliability)

При падении сервера между `prisma.create` и `io.emit()` — событие теряется. Решение:

```sql
-- model event_outbox в schema.prisma
```

✅ **Реализовано:**
- `server/src/outbox.js` — `enqueueEvent()` пишет в `event_outbox` вместо прямого `io.emit()`
- `server/src/outbox-worker.js` — poll-воркер (100ms) читает, отправляет через WS, помечает `sent_at`
- Все HTTP-роуты (tickets, chats, notifications) используют `enqueueEvent()` вместо `getIO().emit()`
- Worker стартует в `index.js`, graceful stop на SIGTERM/SIGINT
- Таблица через Knex-миграцию `migrations/20260716_add_event_outbox.js`

### 49. Dead Letter Queue (background jobs)

✅ **Реализовано** в `server/src/background.js`:

**С Redis (BullMQ):**
- `defaultJobOptions.attempts = 3`, `backoff.type = exponential`, `delay = 2000`
- При исчерпании попыток — job остаётся в failed (не удаляется)
- `service-desk-dlq` очередь — DLQ-воркер логирует каждый failed job
- `checkDlqAlert()` — при > 10 DLQ-задач за час шлёт email админам

**Без Redis (setInterval):**
- `withRetry()` — 3 попытки с exponential backoff + jitter (2s, 4s, 8s + random 0–500ms)
- После 3х неудач — запись в `event_outbox` с event_type `dlq:<taskName>`
- `checkDlqAlert()` проверяет количество dlq-записей каждый час

### 50. Backup Verification

Бэкапы есть (`scripts/backup-mysql.ps1`), но проверяются ли?

```bash
# После каждого backup:
# 1. Создать тестовую БД: CREATE DATABASE servicedesk_verify;
# 2. Восстановить: mysql ... servicedesk_verify < backup.sql
# 3. Проверить: SELECT COUNT(*) FROM tickets > 0
# 4. Удалить: DROP DATABASE servicedesk_verify;
```

❌ Автоматическая верификация не реализована.

### 51. Secrets Rotation Playbook

```bash
# 1. Сгенерировать новый JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 2. Деплой с поддержкой 2 ключей (verify: [old, new], sign: new)
# 3. Ждать 7d (TTL токена)
# 4. Убрать old key
# 5. Аналогично для DB password, SMTP, VAPID keys
```

### 52. Incident Post-Mortem Process

1. **Обнаружение** — Sentry / Grafana / пользователь
2. **Contain** — откат фичи / блокировка / read-only
3. **Diagnose** — найти root cause (логи + трейсы + метрики)
4. **Fix** — deploy + verify
5. **Post-mortem** — что произошло, почему, что делаем, чтобы не повторилось

---

---

## ⚙️ Feature Flags

✅ **Реализовано (Этап 29).**

**Таблица:** `feature_flags` (key VARCHAR PK, enabled BOOLEAN, description VARCHAR, updated_at TIMESTAMP)

**API** (`GET/PUT /api/admin/features`):
- GET возвращает массив `[{ key, enabled, description }]`, кэшируется 30с через `cacheMiddleware`
- PUT принимает `[{ key, enabled }]`, upsert + инвалидация кэша

**Клиент** (`src/hooks/useFeature.ts`):
```ts
// Возвращает true по умолчанию (если нет данных или флаг не найден)
function useFeature(key: string): boolean
function useAllFeatures(): { data: FeatureFlag[] }
```
- React Query со `staleTime: 30_000` (совпадает с серверным кэшем)

**Admin UI** — `FeatureFlagsSection` в `AdminSettings.tsx`:
- Toggle-переключатели для каждого флага
- Save/Reset кнопки (появляются после изменений)
- `data-testid="feature-{key}"` для тестов

**Флаги по умолчанию:** `new_ticket_form`, `kanban_view`, `dark_theme` (все true).

---

## 🔄 API Versioning

⚠️ **Не реализовано.** Пока все роуты на `/api/` без префикса версии.

```js
// server/src/app.js
app.use('/api/v1', v1Routes)
// app.use('/api/v2', v2Routes) // когда breaking change

// Текущий mount() переименовать в mountV1()
```

Зачем: мобильное приложение (Android через Tauri/Capacitor) не обновляется мгновенно.
Старые клиенты должны работать 3-6 месяцев после breaking change.

---

## 🔍 N+1 Query Audit

⚠️ **Нужна ревизия.** PLAYBOOK утверждает что N+1 отсутствует (`Prisma include / _count`), но:

```sql
-- Потенциальные проблемы:
-- 1. tickets.service.js getLeastLoadedAssignee — два отдельных count запроса
-- 2. api.test.js — GET /api/tickets может дёргать messages_count отдельно
-- 3. Каждый вызов mapTicket() на фронте — если API не включил include
```

**Проверка**: включить логирование всех Prisma запросов и искать повторяющиеся `SELECT`:

```js
// prisma.js — включить логирование на staging
log: process.env.NODE_ENV === 'staging' ? ['query', 'info', 'warn'] : ['warn']
```

---

## 📊 Index Audit

✅ 15 индексов в `seed.sql`.

**Что проверить:**
```sql
-- 1. FULLTEXT на search-таблицах (для поиска):
ALTER TABLE tickets ADD FULLTEXT INDEX idx_tickets_ft (title, description);
ALTER TABLE wiki ADD FULLTEXT INDEX idx_wiki_ft (title, content);
ALTER TABLE news ADD FULLTEXT INDEX idx_news_ft (title, content);

-- 2. Composite на частые WHERE (статус + приоритет):
CREATE INDEX idx_tickets_status_priority ON tickets(status, priority);

-- 3. user_id на notifications (для колокольчика):
CREATE INDEX idx_notifications_user_id ON notifications(user_id, created_at DESC);
```

⚠️ **Сейчас FULLTEXT может отсутствовать** — в тестах search.js падал на LIKE fallback вместо FULLTEXT.

---

## 📋 Быстрый старт для нового разработчика

```bash
# 1. Требования
node = 20.11.0 (см. .nvmrc)
npm  >= 10.2.0
MySQL >= 8.0
Redis (опционально)

# 2. Клонирование
git clone https://github.com/elips0675-web/ticketscursor.git
cd ticketscursor
cp server/.env.example server/.env
nvm use                      # авто-смена версии Node

# 3. База данных (MySQL localhost:3306)
cd server && npm run migrate && npm run seed

# 4. Запуск
cd server && npm run dev   # → http://localhost:4000
cd .. && npm run dev        # → http://localhost:5173

# 5. Проверка
npm test                    # 366 frontend tests
cd server && npm test       # 346 backend tests
npx playwright test         # 14 E2E tests
```

### Seeding (тестовые данные)

```bash
npm run seed                # в server/ — заполняет MySQL тестовыми данными
```
Набор: админ, агенты, 50+ тикетов, чаты, сообщения, файлы, уведомления.
`npm run setup` = migrate + seed одной командой.

### Окружение

```bash
# .nvmrc — фиксированная версия Node
nvm use                     # → 20.11.0
# Проверка:
node -e "console.log(process.version)"  # v20.11.0
```

---

*Актуально на июль 2026. Coverage: frontend 71% stmts, backend 71% stmts. Сервер: Prisma + Knex (migrations).*
