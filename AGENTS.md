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

## Осталось

- **Подключение страниц к API** — Polls, News, Admin используют демо-данные, не подключены к бэкенду
- **Тёмная тема** — переключение светлой/тёмной темы
- **Интеграция с бэкендом** — остальные страницы тоже на демо-данных
- **Деплой** — сборка и развёртывание проекта
