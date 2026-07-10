# Service Desk — корпоративная система тикетов

[![CI](https://github.com/elips0675-web/ticketsCursor/actions/workflows/ci.yml/badge.svg)](https://github.com/elips0675-web/ticketsCursor/actions)
[![Coverage](https://img.shields.io/badge/coverage-25%25-yellow)](https://github.com/elips0675-web/ticketsCursor)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()
[![Docker](https://img.shields.io/badge/docker-ready-green.svg)]()

> Production-ready helpdesk с real-time чатами, SLA-эскалацией, RBAC и полнотекстовым поиском

[🚀 Live Demo](https://...) • [📖 API Docs](https://.../api/docs) • [📸 Screenshots](#screenshots)

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

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Клиентский слой                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   React 18  │  │  TypeScript │  │   Vite 5    │  │ Tailwind  │  │
│  │  Concurrent │  │   Strict    │  │   PWA SW    │  │  shadcn   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
│                              │                                       │
│                         HTTP / WebSocket                            │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────┐
│                         Серверный слой                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │  Express 4  │  │   Prisma    │  │ Socket.IO 4 │  │  Zod 15   │  │
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
│  │  16 INDEX   │  │  Sessions   │  │  Multi-stage│  │  2 repl   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Быстрый старт

### Docker (Production)

```bash
git clone https://github.com/elips0675-web/ticketsCursor.git
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
npx playwright install chromium
npm run test:e2e
```

---

## 📊 Метрики проекта

| Показатель | Значение | Статус |
|---|---|---|
| Клиентские тесты | 70 тестов, 23 файла | ✅ Пройдены |
| Серверные тесты | 93 теста, 5 файлов (4 сервисных) | ✅ Пройдены |
| E2E тесты | 22 теста, 5 файлов | ✅ Пройдены |
| Покрытие кода | 20-25% (пороги настроены) | 🟡 В работе |
| React Query | useQuery/useMutation, optimistic updates | ✅ |
| Моделей Prisma | 17 | ✅ |
| API endpoints | 50+ (Swagger) | ✅ |
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
ticketsCursor/
├── client/                    # React 18 + Vite + Tailwind
│   ├── src/
│   │   ├── components/        # UI компоненты (shadcn/ui)
│   │   ├── pages/             # Страницы приложения
│   │   ├── hooks/             # Кастомные хуки
│   │   ├── contexts/          # React Context (auth, tickets, etc.)
│   │   ├── __tests__/         # Unit тесты (Vitest + MSW)
│   │   └── i18n/              # Русский / Английский
│   └── playwright/            # E2E тесты
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

**Стек:** React 18 · TypeScript 5 · Vite · Tailwind CSS v4 · shadcn/ui · Express · Prisma · MySQL 8 · Socket.io · Redis · Docker · Kubernetes · Playwright
