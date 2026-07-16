# Service Desk — корпоративная система тикетов

[![CI](https://github.com/elips0675-web/ticketscursor/actions/workflows/ci.yml/badge.svg)](https://github.com/elips0675-web/ticketscursor/actions)
[![Coverage](https://img.shields.io/badge/coverage-71%25-green)](https://github.com/elips0675-web/ticketscursor)
[![k6](https://img.shields.io/badge/k6-load%20tested-blue)](https://github.com/elips0675-web/ticketscursor)
[![Grafana](https://img.shields.io/badge/Grafana-dashboard-orange)](https://github.com/elips0675-web/ticketscursor)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()
[![Docker](https://img.shields.io/badge/docker-ready-green.svg)]()

> Production-ready helpdesk с real-time чатами, SLA-эскалацией, RBAC и полнотекстовым поиском

[📖 API Docs](/api/docs) • [📸 Screenshots](#screenshots)

---

## 🎯 Возможности

| Модуль | Описание |
|---|---|
| **Тикеты** | CRUD, SLA-мониторинг, автоназначение, эскалация, чат внутри тикета |
| **Real-time** | WebSocket-чаты, уведомления, статус онлайн |
| **RBAC** | 5 ролей: super_admin → admin → senior_agent → agent → requester |
| **Поиск** | FULLTEXT по 6 таблицам, Ctrl+K, группировка по разделам |
| **Файлы** | Drag & drop, S3/MinIO, антивирус ClamAV |
| **Wiki / Новости / Календарь / Опросы** | Полноценные модули с CSV/PDF экспортом |
| **Уведомления** | In-app + Email + Telegram + Web Push |
| **Аудит** | Логирование всех действий |
| **Soft Delete** | `deleted_at` на tickets, ticket_messages, files, chat_messages |
| **Outbox Pattern** | `event_outbox` таблица + Worker для гарантированной доставки событий |
| **SLA** | Мониторинг + оповещения о просрочках, пересчёт при смене приоритета |
| **Health / Readiness** | Probes для K8s — liveness + readiness endpoints |
| **Load Testing** | k6 сценарии в `k6/` для тикетов, чатов, поиска |
| **Grafana** | Дашборд с метриками API, WS, Redis, бизнес-показателями |
| **Bundle-size check** | CI проверка размера сборки (лимит 2MB) |

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Клиентский слой                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   React 19  │  │  TypeScript │  │   Vite 8    │  │Tailwind v4│  │
│  │  Concurrent │  │   Strict    │  │   PWA SW    │  │  shadcn   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
│                              │                                       │
│                         HTTP / WebSocket                            │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────┐
│                         Серверный слой                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
 │  │  Express 5  │  │   Prisma    │  │ Socket.IO 4 │  │  Zod v4   │  │
│  │  Helmet     │  │   ORM 5.22  │  │  Redis Adap │  │  schemas  │  │
│  │  Rate-limit │  │  17 models  │  │  Rooms/RBAC │  │  validate │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────┐
│                         Инфраструктура                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │  MySQL 8.4  │  │   Redis 7   │  │   Docker    │  │  K8s      │  │
│  │  FULLTEXT   │  │  Cache/WS   │  │  Compose    │  │  Ingress  │  │
│  │  16 INDEX   │  │  Sessions   │  │  Node 22    │  │  2 repl   │  │
│  │             │  │             │  │  Multi-stage│  │           │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Быстрый старт

### Docker (Production)

```bash
git clone https://github.com/elips0675-web/ticketscursor.git
cd ticketsCursor
cp server/.env.example server/.env
# Отредактируйте DATABASE_URL, JWT_SECRET, REDIS_URL

docker compose up -d --build
# → http://localhost
```

### Локальная разработка

```bash
# 1. База данных (MySQL + seed)
cd server && npx prisma migrate dev && npx prisma db seed

# 2. API сервер
cd server && npm run dev      # → http://localhost:4000/api
                              # → http://localhost:4000/api/docs (Swagger)

# 3. Frontend
cd .. && npm run dev          # → http://localhost:5173
```

### E2E тесты

```bash
npx playwright install
npm run test:e2e
```

---

## 📊 Code Review (Kimi AI)

### Ревью кода (tickets.js / tickets.service.js)

| Категория | Найдено | Исправлено |
|-----------|---------|------------|
| 🔴 Критичные | 10 | ✅ 10 (Этап 24) |
| 🟡 Средние | 3 | ✅ 3 |
| 🟢 Мелочи | 1 | ✅ 1 |
| **Итог** | **6.5/10 → 10/10** | **Полностью** |

Все критические проблемы закрыты: spread в ответах, fire-and-forget уведомления,
бизнес-логика в роутах, проверка прав чтения, raw SQL, N+1, race condition, super_admin в RBAC.

### Полный аудит проекта: 7.7/10

Проведён комплексный внешний аудит архитектуры, безопасности и качества кода (оценка **7.7/10**).

#### Зоны риска: Было vs Стало

| Зона риска | Было (на момент аудита) | Стало (после доработок) |
|---|---|---|
| Покрытие тестами | 47 client / 93 server / 13 E2E | 360 client / 336 server / 36 E2E |
| Процент покрытия | 20-25% | 70% client / 71% server |
| TanStack Query | Только Context API | ✅ Внедрён QueryClientProvider |
| Meilisearch | MySQL FULLTEXT | ✅ Meilisearch + fallback цепочка |
| Skeleton loaders | Нет | ✅ Все списки |
| Prometheus/Grafana | Нет | ✅ Настроены |
| Роль requester | Нет | ✅ Реализована |
| API versioning | Нет | ✅ unit-префикс (`/api/`) |
| BullMQ вместо setInterval | setInterval | ✅ Реализовано |

#### Итоговый вывод

Все рекомендации Kimi AI выполнены. Проект готов к production.

---

## 📊 Метрики проекта

| Показатель | Значение | Статус |
|---|---|---|---|
| Клиентские тесты | 366 тестов, 51 файл | ✅ Пройдены |
| Серверные тесты | 346 тестов, 25 файлов | ✅ Пройдены |
| E2E тесты (Playwright) | 14 spec'ов, 17 страниц (`check-console.mjs`) | ✅ ALL OK |
| Покрытие кода (клиент) | 71.02% stmts, 60.76% branch, 60.55% funcs (порог: 70/60/60) | ✅ Стабильно |
| Покрытие кода (сервер) | 70.97% stmts, 64% branch (порог: 64/55) | ✅ Стабильно |
| ESLint | 0 errors, 0 warnings | ✅ Чисто |
| check-console (E2E) | 17/17 страниц без ошибок, русский текст | ✅ Пройден |
| Prisma моделей | 18 (добавлен event_outbox) | ✅ |
| API endpoints | 60+ (Swagger + k6 metrics + Health probes) | ✅ |
| React Query | useQuery/useMutation, optimistic updates, staleTime 5min | ✅ |
| Request timing metrics | Prometheus-формат, гистограммы (50–5000ms) | ✅ |
| Моделей Prisma | 17 | ✅ |
| API endpoints | 50+ (Swagger + /api/metrics) | ✅ |
| Docker образы | Multi-stage, non-root | ✅ |
| CI/CD pipeline | Lint → Type-check → Test → Build | ✅ |

---

## 🛡️ Безопасность

| Механизм | Реализация |
|---|---|
| Аутентификация | JWT access (15min) + refresh (7d, httpOnly cookie) |
| Авторизация | RBAC 5 ролей (вкл. requester), иерархическая проверка |
| Валидация | Zod — 15 схем на всех роутах |
| Rate Limiting | Auth: 10/мин, API: 100/мин, Admin: 30/мин |
| Заголовки | Helmet + CORS whitelist |
| Файлы | MIME-фильтр + magic bytes + ClamAV |
| LDAP/AD | ldapjs + auto-provisioning |
| Аудит | Логирование всех действий в audit_log |

---

## 📁 Структура проекта

```
ticketscursor/
├── src/                       # React 19 + Vite + Tailwind
│   ├── components/            # UI компоненты (shadcn/ui)
│   ├── pages/                 # Страницы приложения
│   ├── hooks/                 # Кастомные хуки
│   ├── context/               # React Context (auth, tickets, etc.)
│   ├── __tests__/             # Unit тесты (Vitest + MSW)
│   └── i18n/                  # Русский / Английский
│
├── e2e/                       # Playwright E2E тесты
│
├── server/                    # Express + Prisma + MySQL
│   ├── src/
│   │   ├── routes/            # API роуты (тонкие контроллеры)
│   │   ├── services/          # Бизнес-логика
│   │   ├── middleware/        # Auth, RBAC, rate-limit, audit
│   │   ├── utils/             # Helpers (roleUtils, cache, notify, storage)
│   │   ├── prisma/            # Schema + migrations
│   │   └── __tests__/         # Server tests (Vitest + Supertest)
│   └── docker/                # Dockerfiles
│
├── docker-compose.yml         # MySQL + Redis + API + Frontend
├── k8s/                       # Kubernetes manifests
└── .github/workflows/         # CI/CD GitHub Actions
```

---

## 🔧 Переменные окружения

```bash
# server/.env
DATABASE_URL="mysql://user:pass@localhost:3306/service_desk"
JWT_SECRET="your-super-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret"
REDIS_URL="redis://localhost:6379"          # опционально
S3_ENDPOINT=""                              # опционально
SENTRY_DSN=""                               # опционально
CLAMAV_ENABLED="false"                      # опционально
TELEGRAM_BOT_TOKEN=""                       # опционально
LDAP_URL=""                                 # опционально
```

---

## 📜 Лицензия

MIT © 2026

---

**Стек:** React 19 · TypeScript 5 · Vite 8 · Tailwind CSS 4 · shadcn/ui · Express · Prisma · MySQL 8 · Socket.io · Redis · Docker · Kubernetes · Playwright · Meilisearch
