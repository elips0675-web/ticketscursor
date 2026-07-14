## О разработчике

- **Роль**: Senior Frontend / Fullstack Developer (Корпоративные системы)
- **Опыт**: 3+ года — Helpdesk, CRM, ERP, Service Desk
- **Понимает**: SLA, тикетинг, workflow заявок, RBAC, SSO/LDAP
- **Стек**: React 19, TypeScript 5, Vite 8, Tailwind CSS 4, shadcn/ui, Express, Prisma, MySQL, JWT, Recharts
- **Фокус**: UX для корпоративных пользователей, безопасность (helmet, rate-limit), модульная архитектура
- **Умеет**: дашборды с аналитикой, таблицы с фильтрацией/поиском, интеграция чатов/календарей/файлов, чистый типизированный код
- **Ищет**: задачи в корпоративном ПО — Service Desk, CRM, ERP, BPM, внутренние порталы

## Правила работы

1. Код на русском (UI), комментарии по минимуму
2. Перед изменениями читать существующий код, повторять стиль
3. Не ломать работающее — сначала понять, потом менять
4. Все изменения через `git add -A && git commit && git push`
5. После задач запускать `npm test` и `npm run build`
6. Предлагать простые решения, не усложнять
7. Если что-то непонятно — спросить, не гадать
8. После завершения этапа — убрать его из ПЛАН ДОРАБОТКИ ПО ЭТАПАМ в Что сделано.txt и обновить статусы в АУДИТ ПРОЕКТА
9. **После каждого изменения кода** — запускать Playwright скрипт `check-console.mjs`, проверять `errors: []` и `hasRussianText: true`; при наличии ошибок — исправить до ответа пользователю

## Контроль качества кода

При генерации и изменении кода обязательно:

- **Типизация**: строгий TypeScript (`strict: true`), избегать `any`, явные типы для пропсов и состояний
- **Обработка ошибок**: try/catch во всех асинхронных операциях, проверка на null/undefined, ErrorBoundary на ключевых компонентах
- **Импорты**: проверять что пути существуют, использовать алиас `@/` для src, не оставлять мёртвых импортов
- **Асинхронность**: все асинхронные функции должны иметь await или .catch(), никаких забытых промисов
- **API**: после изменений на бэкенде — синхронизировать типы на фронтенде
- **Тесты**: предлагать тесты для новой функциональности
- **Линтер**: перед коммитом проверять `npm run lint` и `npm run type-check`

## Автоматический контроль ошибок

| Этап | Инструмент | Что проверяет |
|------|-----------|---------------|
| **При коммите** | Husky → lint-staged | `eslint --fix` + `prettier --write` на изменённых файлах |
| **В CI (GitHub Actions)** | `tsc --noEmit` | TypeScript strict type-check |
| | `eslint . --max-warnings 100` | Синтаксис, неисп. переменные, импорты |
| | `vitest run` | Юнит-тесты (209 клиентских + 295 серверных) |
| | `vite build` | Сборка production |
| **Тестовая БД** | `vitest.global-setup.js` | Создаёт `servicedesk_test`, мигрирует, сидит, фиксит колонки |
| **Rate limiter** | `app.js` | Отключён при `NODE_ENV=test` через `skip` |
| **Ручной запуск** | `npm run lint` | ESLint (warnings: `no-explicit-any`, `no-unused-vars`) |
| | `npm run type-check` | `tsc --noEmit` |
| | `npm test` | Vitest (клиент) |
| | `cd server && npm test` | Vitest (сервер) |
| **После каждого изменения** | `node check-console.mjs` | Playwright проверяет 6 страниц (`/`, `/wiki`, `/chats`, `/tickets`, `/employees`, `/search`) на: `errors: []`, `hasRussianText: true` |
| **Pre-commit hook** | `.husky/pre-commit` | `npx lint-staged` — автофикс и форматирование |

## Сделано

### Этап 1 — Базовая настройка
- Клонирован репозиторий, установлены зависимости
- Исправлены типы FK в миграциях (`unsigned()`)
- Исправлены seed-данные (invalid `status: 'critical'` → `'open'`)

### Этап 2 — Мобильная навигация
- Создана нижняя панель навигации (Dashboard, Tickets, Chats, Employees + Ещё)
- Sheet переработан в единый контролируемый экземпляр (было два независимых Radix Dialog)
- Из Sidebar вынесен `SidebarContent` для переиспользования в мобильном меню
- Исправлены цвета мобильного меню (`bg-sidebar text-sidebar-foreground`)
- Добавлен `onNavigate` для закрытия меню при переходе
- Добавлен PWA-install prompt (`beforeinstallprompt`)
- Переключена стратегия PWA на `injectManifest`

### Этап 3 — Push-уведомления
- `web-push` на бэкенде + VAPID keys
- `POST /api/push/send` (admin/senior_agent)
- Хук `use-push` (подписка/отписка)
- Кастомный service worker (`public/sw.js`)
- Ручная регистрация SW в `main.tsx`

### Этап 4 — Админка + RBAC
- `requireRole()` middleware на: POST /register (admin), DELETE /calendar/:id (senior_agent+), PUT /tickets/:id/status (senior_agent+), PUT /tickets/:id/priority (senior_agent+)
- `GET /api/admin/users`, `PUT /api/admin/users/:id`
- AdminLayout — отдельный лейаут со своим сайдбаром (Dashboard, Users, Push)
- Страницы: Admin.tsx (дашборд), AdminUsers.tsx (список, роли, блокировка), AdminPush.tsx (подписка + отправка)
- `/admin` вынесен из основного лейаута

### Этап 5 — Плиточная вёрстка
- **Polls.tsx** → плитка (1→2→3 колонки), варианты всегда видны, expand/collapse убран
- **Tickets.tsx** → плитка (1→2→3 колонки) + пагинация «Показать ещё» (по 9)
- **News.tsx** → плитка (1→2→3 колонки) + пагинация «Показать ещё» (по 6)
- **Search.tsx** → результаты внутри каждой секции плиткой (grid 1→2 колонки), убран `max-w-3xl`

### Этап 6 — RBAC фронтенд
- **TicketDetail**: скрыто управление (статус/приоритет/назначение) для `agent`
- **Polls**: кнопка «Создать опрос» только для `canManage`
- **Calendar**: кнопка удаления события только для `canManage`
- **ProtectedRoute**: новый компонент, редирект на `/login` без токена, на `/` при недостатке прав
- **Register + /admin/***: защищены через `ProtectedRoute adminOnly`
- **Тесты расширены**: 9→17 тестов (RBAC, register validation)

### Этап 7 — WebSocket / real-time
- **SocketContext.tsx**: исправлена передача instance (был stale ref), добавлен `connected`
- **socket.js**: `getIO()` экспорт для доступа из REST-роутов
- **tickets.js**: эмиты `ticket:created`, `ticket:updated` (status/priority/assign), `ticket:message`, `ticket:message-removed`
- **Toaster (sonner)**: добавлен в `App.tsx` для toast-уведомлений
- **Tickets.tsx**: слушает `ticket:created` / `ticket:updated` → toast
- **TicketDetail.tsx**: слушает `ticket:message` для активного тикета → toast
- Все эмиты безопасны (`getIO()?.emit` — не падает без WebSocket)

### Этап 8 — Подключение страниц к API
- **Polls.tsx** — подключён к API (GET/POST /api/polls, POST /api/polls/:id/vote)
- **News.tsx** — подключён к API (GET/POST /api/news)
- **Wiki.tsx** — подключён к API (GET/POST /api/wiki)
- **Calendar.tsx** — подключён к API (GET/POST/DELETE /api/calendar)
- **Files.tsx** — подключён к API (GET /api/files/folders)
- **Chats.tsx** — подключён к API (GET /api/chats)
- **Profile.tsx** — данные из AuthContext + /api/employees
- **Admin.tsx / AdminUsers.tsx / AdminPush.tsx** — уже были на API
- Убраны DEMO-данные из 7 страниц

### Этап 9 — Тёмная тема (удалена позже)
- Была реализована (ThemeContext, ThemeToggle, `.dark` CSS-переменные)
- Позже удалена по решению — тёмная тема не нужна в корп. системе

### Этап 10 — Финальная проверка проекта
- Установлен недостающий пакет `multer` на сервере (ломало тесты)
- Запущена полная сборка (`npm run build`) — успешно
- Запущены клиентские тесты (14/14) — все пройдены
- Запущены серверные тесты (17/17) — все пройдены
- Обновлён AGENTS.md с профилем разработчика и правилами

### Этап 11 — Доработка файлового хранилища
- **files.js**: добавлен multer с дисковым хранилищем (было только JSON-метаданные)
- **Files.tsx**: переход на FormData, открытие файлов по клику (через `/uploads/files/...`)
- **seed.sql**: добавлена колонка `path` в таблицу `files`
- **types/index.ts**: добавлено поле `path` в `FileItem`

## Состояние проекта

Всё, что планировалось на 10 этапов — выполнено. Проект полностью рабочий:

| Компонент | Статус |
|-----------|--------|
| Тикеты (CRUD, статусы, приоритеты, назначение) | ✅ API + UI |
| Дашборд (статистика, графики, сотрудники) | ✅ API (с fallback на demo) |
| Чаты (WebSocket, сообщения, файлы) | ✅ Socket.io |
| Wiki (статьи, категории, поиск, изображения) | ✅ API + UI |
| Новости (лента, фильтры, создание) | ✅ API + UI |
| Календарь (события, CRUD) | ✅ API + UI |
| Опросы (голосование, создание) | ✅ API + UI |
| Файлы (drag & drop, папки, загрузка) | ✅ multer + FormData |
| Сотрудники (список, карточки/таблица, фильтры) | ✅ API + UI |
| Поиск (глобальный, Ctrl+K) | ✅ API + UI |
| Админка (пользователи, push, настройки, аудит) | ✅ API + UI |
| RBAC (admin/senior_agent/agent) | ✅ middleware + ProtectedRoute |
| Аутентификация (JWT, логин, регистрация) | ✅ API + UI |
| PWA (service worker, push, install prompt) | ✅ injectManifest |
| WebSocket (real-time уведомления, чаты) | ✅ Socket.io |
| Тёмная тема (CSS vars, переключатель) | ❌ удалена |
| CI/CD (GitHub Actions) | ✅ .github/workflows/ci.yml |
| Docker (compose, 3 контейнера) | ✅ docker-compose.yml |
| Vercel (SPA routing) | ✅ vercel.json |
| Tauri (десктоп) | ✅ config + Rust |
| Email (nodemailer) | ✅ server/src/email.js |
| Telegram (бот) | ✅ server/src/telegram.js |
| PDF/CSV экспорт | ✅ jsPDF + html2canvas / UTF-8 BOM |
| i18n (RU/EN) | ✅ i18next |
| Уведомления (колокольчик) | ✅ API + socket + UI |

## Деплой

```bash
# Docker (prod)
docker compose up -d --build

# Локальная разработка
# 1. Запустить MySQL (Laragon или Docker)
# 2. cp server/.env.example server/.env
# 3. cd server && npm run dev
# 4. cd .. && npm run dev
```

### Этап 12 — Опциональные улучшения
- **Swagger/OpenAPI**: `GET /api/docs` — swagger-ui-express с полной спецификацией всех эндпоинтов
- **E2E (Playwright)**: настройка `playwright.config.ts`, тест логина (`e2e/login.spec.ts`), скрипты `npm run test:e2e`
- **Redis**: Socket.io Redis adapter (`@socket.io/redis-adapter` + `ioredis`), на `REDIS_URL` — адаптер включён, без Redis — fallback на in-memory
- **Kubernetes**: полные манифесты в `k8s/` (namespace, ConfigMap, Secrets, MySQL + PVC, Redis, API (2 реплики), Frontend (2 реплики), Ingress)

### Этап 13 — Prisma read replicas (удалено позже)
- Было реализовано: prisma.js (replicas), schema.prisma (directUrl), docker-compose (REPLICA_DATABASE_URL)
- Позже удалено — read replicas не нужны в текущей архитектуре, убран мёртвый код

### Этап 14 — Виртуализация списков (@tanstack/react-virtual)
- **TicketDetail.tsx**: `useVirtualizer` для сообщений, fallback в jsdom
- **ChatDetail.tsx**: `useVirtualizer` для сообщений + вынесен `renderMsg()`
- При >100 сообщений рендерятся только видимые + 5 overscan

### Этап 15 — Code review fixes (Kimi AI)
- **README**: версии React 19, Vite 8, Tailwind v4, coverage 51%; метрики тестов обновлены
- **cache.js**: Redis `SCAN` вместо `KEYS` — не блокирует Redis
- **seed.sql**: `idx_employees_role_active` для `getLeastLoadedAssignee`
- **k8s/hpa.yaml**: HPA api 2→8, frontend 2→6, CPU 70% / Memory 80%
- **use-push.ts**: `.catch()` на unhandled rejection

### Этап 17 — Code review fixes (Правка kimi.txt + Правка kimi1.txt, 7+8 проблем)
- **ESLint**: убран `'server/'` из игнора, добавлен Node.js-конфиг через `globals.node`
- **main.tsx**: убран дублирующийся `QueryClientProvider` (остался только в App.tsx)
- **App.tsx**: `/register` обёрнут в `<ProtectedRoute adminOnly>`
- **auditLogMiddleware**: перенесён из `mount()` в app.js внутрь каждого роутера после `authenticateToken` (12 файлов)
- **notify.js**: добавлен `safeNotify()` — .catch() на все вызовы `createNotification` (4 места)
- **socket.js**: вынесен `import { createNotification }` наверх (был динамический импорт на каждое сообщение)
- **socket.js**: `message:delete` использует `hasRole()` вместо прямой проверки (super_admin теперь проходит)
- **socket.js**: `wsRateLimit` — добавлен `Math.floor()` для токенов
- **background.js**: `.catch(() => {})` на `sendTicketNotification` в `warnAdminRedisMissing`
- **files.js**: добавлен `import prisma` (был missing import)
- **validate.js**: добавлен `import { ZodError } from 'zod'`
- **Kanban.tsx**: добавлены `MessageSquare, User` из lucide-react (были missing imports)
- **Lint**: 0 errors, 115 warnings (сервер теперь линтится)
- **docker-compose.yml**: убрано монтирование primary.cnf (файл удалён)
- **package.json**: удалён scripts.tauri (Tauri CLI удалён ранее)
- **admin.js**: $queryRaw → findMany(), явный guard super_admin (403)
- **schemas.ts/schemas.js**: Zod v4 — .email({ message: }) вместо .email('...')
- **app.js**: mount() больше не дублирует /api/v1/, swagger/docs только /api/docs
- **ticket-context.tsx**: хардкод localhost:4000 → импорт API_URL из @/lib/api.ts
- **notify.js**: ранний return в notifySlaBreached → per-user dedup (не блокирует алерты assignee/admin)
- **tickets.js**: POST /:id/messages — добавлена проверка прав (creator/assignee/senior_agent+)
- **api.ts**: handleResponse — исправлен double res.json() (читаем тело один раз)
- **AuthContext.tsx**: добавлен loading state для предотвращения мигания ProtectedRoute
- **ticket-context.tsx**: authFetch — добавлен 401/403 редирект на /login
- **ProtectedRoute.tsx**: spinner пока loading=true
- **utils.ts**: date-fns locale динамический (из localStorage i18nextLng)
- **use-push.ts**: isSubscribing ref для защиты race condition
- **Kanban.tsx**: DnD dataTransfer fallback на dragId
- **en.json**: удалён дубль hasAccount
- **App.tsx**: AdminLayout обёрнут в ErrorBoundary
- **AuthContext.tsx**: logout — сохранение token до очистки (fixed race condition)
- **.gitignore**: убран check-console.mjs (скрипт нужен новым разработчикам)
- **TECHNICAL.md**: удалён раздел MySQL Read Replicas
- **docker-compose.yml**: JWT_SECRET fallback (`:-dev-jwt-secret-change-in-production`)
- **docker-compose.yml**: удалён mysql_replica (мёртвый код), удалён REPLICA_DATABASE_URL
- **prisma.js**: убрана опция `replicas` (была неиспользуема)
- **mysql/**: удалены replica.cnf, primary.cnf, init-replica.sh
- **socket.js**: добавлен connection rate limit (10 handshake/min per IP)
- **background.js**: экспортирован `stopBackgroundJobs()`, setInterval сохраняется в `cleanupTimer`/`slaTimer`
- **index.js**: вызов `stopBackgroundJobs()` в shutdown handler
- **cache.js**: `SCRIPT LOAD` + `evalsha` с fallback на `eval`
- **package.json**: удалён `@tauri-apps/cli` (мёртвый вес)
- **app.js**: добавлен `beforeSend` в Sentry — фильтр PII (Authorization, Cookie, stack vars)

### Этап 16 — Полный функциональный аудит (Промт тест.txt, ~200 проверок)
- ✅ Раздел 1: Auth + RBAC — добавлен logout endpoint (инвалидация refresh token)
- ✅ Раздел 2: Тикеты — VALID_TRANSITIONS (невалидный переход → 400), agent-фильтр (свои + неназначенные), SLA пересчёт при смене приоритета
- ✅ Раздел 3: Чаты — пагинация сообщений (page/limit/total), валидация длины (max 2000)
- ✅ Раздел 4: Файлы — role check на DELETE (senior_agent+)
- ✅ Раздел 9: Админка — super_admin исключён из выбора ролей, запрет self-demotion
- ✅ Раздел 12: Безопасность — запрет promotion до super_admin через API

### Этап 19 — Coverage 57%-64%, ESLint 0 any-warn, +46 тестов
- **ESLint**: исправлены 43 `no-explicit-any` в 20 файлах (0 warnings)
- **Серверные тесты**: 239→**295** (6 новых файлов: cache, email, storage, validateUpload, clamav, background)
- **Клиентские тесты**: 163→**209** (Login, Search, Tickets, Employees, Dashboard expanded)
- **Пороги клиент**: stmts 57, branches 48, functions 45, lines 60
- **Пороги сервер**: stmts 64, branches 55, functions 62, lines 63

### Этап 20 — Dashboard 100% coverage, +10 тестов
- **Dashboard.tsx**: 32%→**100%** Stmts/Funcs/Lines, Branch 22%→**69%**
  - Покрыты onClick/onKeyDown хендлеры через userEvent.click/type
- **Тесты**: 209→**219** (+10 в Dashboard.expanded.test.tsx)
- **Общий клиент**: 57.33%→**58.5%** Stmts, 48.22%→**49.21%** Branch, 45.64%→**47.36%** Funcs, 60.09%→**61.38%** Lines
- **Пороги обновлены**: stmts 58, branches 49, functions 47, lines 61

### Этап 21 — Tickets 90% coverage, +11 тестов
- **Tickets.tsx**: 41%→**90%** Stmts, 41%→**79%** Branch, 41%→**83%** Funcs, 42%→**90%** Lines
  - Покрыты: фильтры (поиск/статус/приоритет), пагинация, пустое состояние, socket-подписки, export CSV/PDF
- **Тесты**: 219→**230** (+11 в Tickets.expanded.test.tsx)
- **Общий клиент**: 58.5%→**60.87%** Stmts, 50.39%→**50.39%** Branch, 47.36%→**48.81%** Funcs, 61.38%→**63.66%** Lines
- **Пороги обновлены**: stmts 60, branches 50, functions 48, lines 63

### Этап 22 — Calendar 84% coverage, +18 тестов
- **Calendar.tsx**: 43%→**83.69%** Stmts, 38.37%→**80.23%** Branch, 33.33%→**80.55%** Funcs, 45.34%→**86.04%** Lines
  - Покрыты: клик по дню, события, пустое состояние, create/edit/delete, RBAC, CSV export, навигация, skeleton
- **Тесты**: 230→**261** (+18 в Calendar.expanded.test.tsx)
- **Общий клиент**: 60.87%→**63.76%** Stmts, 50.39%→**53.21%** Branch, 48.81%→**52.77%** Funcs, 63.66%→**66.61%** Lines
- **Пороги обновлены**: stmts 63, branches 53, functions 52, lines 66

### Этап 23 — Admin 98% coverage, +22 теста
- **Admin.tsx**: 41%→**97.82%** Stmts, 13.15%→**86.84%** Branch, 30.76%→**100%** Funcs, 44.18%→**100%** Lines
  - Покрыты: stat cards (employees/online/tickets/active), employee list, role stats, SLA stats, refresh, API errors
  - Mock fetch напрямую (Admin использует fetch, не api-сервис)
  - Покрыт unwrapApiData с null data
- **Тесты**: 261→**283** (+22 в Admin.expanded.test.tsx)
- **Общий клиент**: 63.76%→**64.97%** Stmts, 53.21%→**55.05%** Branch, 52.77%→**53.95%** Funcs, 66.61%→**67.85%** Lines
- **Пороги обновлены**: stmts 64, branches 55, functions 53, lines 67

### Этап 24 — Client coverage 64.97%→71.02%, +73 теста
- **News.tsx**: 43%→**79.74%** Stmts (+11 тестов: поиск, фильтр, создание, CSV, пустое)
- **Polls.tsx**: 44%→**74.07%** Stmts (+14 тестов: форма, голосование, empty, closed, delete)
- **Files.tsx**: 46%→**84.44%** Stmts (+17 тестов: empty, search, view, category, upload, drag-drop, keyboard, folder switch, list view, drag overlay)
- **AdminPush.tsx**: 38%→**91.66%** Stmts (+13 тестов: подписка, отправка, loading, error)
- **ForgotPassword.tsx**: 46%→**~85%** (+6 тестов: submit, sent, loading, validation)
- **ResetPassword.tsx**: 33%→**~85%** (+8 тестов: no token, валидация, API error, loading)
- **pwa-install-prompt.tsx**: 45%→**~100%** (+5 тестов: beforeinstallprompt, install, dismiss)
- **AppLayout**: Ctrl+K shortcut (+1 тест)
- **Тесты**: 283→**356** (+73), **51** файл
- **Общий клиент**: 64.97%→**71.02%** Stmts, 55.05%→**60.76%** Branch, 53.95%→**60.55%** Funcs, 67.85%→**73.96%** Lines
- **Сервер**: 336 тестов, **70.97%** Stmts (не изменён)
- **Пороги обновлены**: stmts 70, branches 60, functions 60, lines 73
