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
Initial JS bundle:       < 200 KB gzip
API response time (p95): < 500ms
```
✅ Code splitting (React.lazy) на всех страницах
✅ Virtual scrolling (`@tanstack/react-virtual`) в чатах и сообщениях тикетов

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
- [ ] Skip-to-content link
- [ ] `aria-live` для динамических уведомлений (новый тикет, сообщение)
- [ ] Touch target ≥ 44×44px (мобильная навигация)
- [ ] `prefers-reduced-motion` — убрать анимации

---

## 🗄️ Database

### 32. Query Optimization
✅ Индексы на все foreign keys и частые WHERE (seed.sql, 15 индексов)
✅ N+1 отсутствует — Prisma `include` / `_count` select
✅ Пагинация offset-based (админка) + cursor-based (чаты)

### 33. Soft Deletes
❌ **Не реализовано**. Все DELETE — физические.
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
➡️ Для production нужен strict CSP:
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
Unit (business logic):    366 frontend + 346 backend = 712 tests
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
| 34 | Idempotency Keys | 🔴 Высокий | 2 часа | Исключает дубли сообщений/тикетов при network error |
| 33 | Soft Deletes | 🟠 Средний | 4 часа | Безопасность данных, восстановление после ошибок |
| 30 | a11y: skip-link, aria-live | 🟠 Средний | 1 час | Доступность для screen reader |
| 27 | Performance Budget в CI | 🟡 Низкий | 1 час | Контроль bundle size в PR |
| 4 | Strict CSP | 🟡 Низкий | 2 часа | Защита от XSS |

---

## 🔧 Idempotency Keys — реализация

```js
// server/src/middleware/idempotency.js
import { createClient } from 'redis'

const REDIS_URL = process.env.REDIS_URL

export function idempotent(fn) {
  return async (req, res) => {
    const key = req.headers['idempotency-key']
    if (!key) return fn(req, res)

    const cache = createClient({ url: REDIS_URL })
    await cache.connect()
    const existing = await cache.get(`idemp:${key}`)
    if (existing) {
      await cache.disconnect()
      return res.json(JSON.parse(existing))
    }

    const originalJson = res.json.bind(res)
    res.json = (body) => {
      cache.setEx(`idemp:${key}`, 86400, JSON.stringify(body)).catch(() => {})
      cache.disconnect()
      return originalJson(body)
    }

    return fn(req, res)
  }
}
```

Использовать на `POST /chats/:id/messages`, `POST /tickets`, `POST /tickets/:id/messages`.

---

## 🔧 Soft Deletes — реализация

```sql
-- Миграция: 002_add_soft_delete.sql
ALTER TABLE tickets ADD COLUMN deleted_at TIMESTAMP NULL AFTER updated_at;
ALTER TABLE chat_messages ADD COLUMN deleted_at TIMESTAMP NULL AFTER updated_at;
ALTER TABLE files ADD COLUMN deleted_at TIMESTAMP NULL AFTER created_at;

CREATE INDEX idx_tickets_deleted ON tickets(deleted_at);
CREATE INDEX idx_chat_messages_deleted ON chat_messages(deleted_at);
CREATE INDEX idx_files_deleted ON files(deleted_at);
```

Сервисы обновить: все `findMany`/`count` с `where: { deleted_at: null }`.
`DELETE` → `update({ data: { deleted_at: new Date() } })`.

---

## 📋 Быстрый старт для нового разработчика

```bash
# 1. Требования
node >= 20.11.0
npm  >= 10.2.0
MySQL >= 8.0
Redis (опционально)

# 2. Клонирование
git clone https://github.com/elips0675-web/ticketscursor.git
cd ticketscursor
cp server/.env.example server/.env

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

---

*Актуально на июль 2026. Coverage: frontend 71% stmts, backend 71% stmts.*
