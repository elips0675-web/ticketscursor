## О разработчике

- **Роль**: Senior Frontend / Fullstack Developer (Корпоративные системы)
- **Опыт**: 3+ года — Helpdesk, CRM, ERP, Service Desk
- **Понимает**: SLA, тикетинг, workflow заявок, RBAC, SSO/LDAP
- **Стек**: React 18, TypeScript, Vite, Tailwind, shadcn/ui, Express, MySQL, JWT, Recharts
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

### Этап 9 — Тёмная тема
- **ThemeContext** — провайдер с переключением light/dark, сохранение в localStorage
- **ThemeToggle** — кнопка в сайдбаре (десктоп + мобильное меню)
- CSS-переменные `.dark` уже были в index.css

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
| Тёмная тема (CSS vars, переключатель) | ✅ (переключатель скрыт) |
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
