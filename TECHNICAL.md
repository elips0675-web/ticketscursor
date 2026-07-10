# Техническая документация — Service Desk

> Документация для CTO, техлидов и DevOps. Описывает архитектуру, принятые решения и инфраструктуру.
>
> **Оценка архитектуры (Kimi AI):** 7.7/10 → **8.5/10** после выполнения рекомендаций

---

## 📋 Содержание

1. [Стек технологий](#стек-технологий)
2. [Архитектура backend](#архитектура-backend)
3. [Аутентификация и авторизация](#аутентификация-и-авторизация)
4. [База данных](#база-данных)
5. [Real-time (WebSocket)](#real-time-websocket)
6. [SLA и эскалация](#sla-и-эскалация)
7. [Файловое хранилище](#файловое-хранилище)
8. [Уведомления](#уведомления)
9. [Кэширование](#кэширование)
10. [Тестирование](#тестирование)
11. [Логирование и мониторинг](#логирование-и-мониторинг)
12. [Инфраструктура](#инфраструктура)
13. [API Response Format](#api-response-format)
14. [Известный технический долг](#известный-технический-долг)

---

## Стек технологий

| Слой | Технология | Версия | Назначение |
|---|---|---|---|
| **Frontend** | React | 18.3 | UI фреймворк, Concurrent Features |
| | TypeScript | 5.x | Типобезопасность, strict mode |
| | Vite | 5.x | Сборка, HMR, PWA |
| | Tailwind CSS | 4.x | CSS-first подход, @theme |
| | shadcn/ui | latest | Компоненты на Radix UI |
| | Framer Motion | latest | Анимации |
| | Recharts | 2.x | Графики дашборда |
| | i18next | latest | Интернационализация (RU/EN) |
| | Zustand / Context | — | State management |
| **Backend** | Express | 4.x | HTTP сервер |
| | Prisma ORM | 5.22.0 | Типобезопасный доступ к БД |
| | Zod | 3.x | Валидация входных данных |
| | Socket.io | 4.x | Real-time коммуникации |
| | JWT (jsonwebtoken) | 9.x | Аутентификация |
| | bcrypt | 5.x | Хеширование паролей |
| | Winston | 3.x | Логирование |
| | Multer | 1.x | Загрузка файлов |
| | nodemailer | latest | Email-уведомления |
| | node-telegram-bot-api | latest | Telegram-уведомления |
| | web-push | latest | Push-уведомления |
| | ldapjs | latest | LDAP/AD аутентификация |
| | jsPDF + html2canvas | latest | PDF экспорт |
| **База данных** | MySQL | 8.4 | Основное хранилище |
| | FULLTEXT INDEX | — | Полнотекстовый поиск |
| **Кэш / Real-time** | Redis | 7.x | Кэш, Socket.io adapter |
| | In-memory Map | — | Fallback при отсутствии Redis |
| **Тестирование** | Vitest | 1.x | Unit / Integration тесты |
| | jsdom | — | DOM для клиентских тестов |
| | MSW | — | Mock Service Worker |
| | Supertest | — | HTTP тесты |
| | Playwright | 1.x | E2E тесты |
| **Инфраструктура** | Docker | — | Контейнеризация |
| | Docker Compose | — | Локальное окружение |
| | Kubernetes | — | Оркестрация |
| | GitHub Actions | — | CI/CD |
| | Nginx | 1.27 | Reverse proxy, SPA routing |

---

## Архитектура backend

### Принципы

- **Чистая архитектура**: routes → services → repositories (Prisma)
- **Тонкие контроллеры**: только валидация, вызов сервиса, форматирование ответа
- **Единый формат ответа**: `{ success: boolean, data?: T, message?: string }`
- **Централизованная обработка ошибок**: middleware, не try-catch в каждом контроллере
- **RBAC на уровне middleware**: `requireRole()` проверяет до входа в контроллер

### Структура директорий

```
server/src/
├── index.js                    # Точка входа, graceful shutdown
├── app.js                      # Express app (middleware, routes)
│
├── routes/                     # Тонкие контроллеры
│   ├── auth.js                 # Логин, регистрация, refresh, LDAP
│   ├── tickets.js              # CRUD тикетов, SLA, назначение
│   ├── chats.js                # Чаты, сообщения, mark read
│   ├── files.js                # Файловое хранилище
│   ├── employees.js            # Сотрудники, онлайн-статус
│   ├── wiki.js                 # Wiki-статьи
│   ├── news.js                 # Новостная лента
│   ├── polls.js                # Опросы, голосование
│   ├── calendar.js             # События календаря
│   ├── search.js               # Глобальный поиск (FULLTEXT)
│   ├── admin.js                # Админ-панель
│   ├── push.js                 # Push-подписки
│   ├── ldap.js                 # LDAP конфигурация
│   └── system.js               # Healthcheck, системная информация
│
├── services/                   # Бизнес-логика
│   ├── tickets.service.js      # createTicket, updateTicket, autoAssign, SLA
│   ├── chats.service.js        # getChats, createMessage, markRead
│   ├── files.service.js        # getFolders, createFolder, uploadFile
│   ├── polls.service.js        # listPolls, createPoll, votePoll
│   ├── wiki.service.js         # listArticles, createArticle
│   ├── news.service.js         # listNews, createNews
│   ├── employees.service.js    # listEmployees, getStats
│   └── calendar.service.js     # listEvents, createEvent
│
├── middleware/
│   ├── authenticateToken.js    # JWT verification
│   ├── requireRole.js          # RBAC hierarchy check
│   ├── rateLimit.js            # Rate limiting (auth/api/admin)
│   ├── auditLog.js             # Audit logging middleware
│   ├── errorHandler.js         # Global error handler
│   └── requestId.js            # X-Request-Id (UUID)
│
├── utils/
│   ├── roleUtils.js            # hasRole() hierarchy utility
│   ├── cache.js                # Redis / in-memory cache adapter
│   ├── notify.js               # Unified notifications (in-app/email/telegram)
│   ├── storage.js              # S3 / local disk storage adapter
│   ├── logger.js               # Winston logger configuration
│   └── validators/             # Zod schemas
│       ├── auth.schema.js
│       ├── ticket.schema.js
│       └── ...
│
├── prisma/
│   ├── schema.prisma           # 17 моделей
│   └── migrations/             # Knex + Prisma migrations
│
└── __tests__/
    ├── api.test.js             # Integration tests (auth, RBAC, search, push)
    ├── chats.service.test.js   # Service layer tests
    ├── employees.service.test.js
    ├── news.service.test.js
    └── calendar.service.test.js
```

---

## Аутентификация и авторизация

### JWT Flow

```
┌─────────────┐     POST /auth/login      ┌─────────────┐
│   Client    │ ──────────────────────────▶ │   Server    │
│             │                             │             │
│             │ ◀────────────────────────── │  bcrypt     │
│             │  { accessToken, employee }  │  compare    │
│             │  Set-Cookie: refresh=...    │  JWT sign   │
└─────────────┘                             └─────────────┘
       │                                           │
       │  Запрос к API (Authorization: Bearer)     │
       │ ──────────────────────────────────────────▶│
       │                                           │
       │ ◀──────────────────────────────────────────│
       │           200 OK / 401 / 403               │
       │                                           │
       │  POST /auth/refresh (httpOnly cookie)    │
       │ ──────────────────────────────────────────▶│
       │  { newAccessToken }                       │
```

### Роли и иерархия

```javascript
// roleUtils.js / middleware.js
const ROLE_HIERARCHY = ['requester', 'agent', 'senior_agent', 'admin', 'super_admin'];

function hasRole(userRole, minRole) {
  const userLevel = ROLE_HIERARCHY.indexOf(userRole);
  const minLevel = ROLE_HIERARCHY.indexOf(minRole);
  if (userLevel === -1 || minLevel === -1) return false;
  return userLevel >= minLevel;
}
// super_admin проходит ВСЕ проверки, requester — только свои тикеты
```

| Роль | Доступ |
|---|---|---|
| `super_admin` | Полный доступ, включая админ-панель |
| `admin` | Управление пользователями, настройки |
| `senior_agent` | Все тикеты, SLA-мониторинг, назначение |
| `agent` | Свои тикеты, чаты, wiki, сотрудники |
| `requester` | Только свои тикеты, дашборд, профиль |

### Middleware цепочка

```javascript
// Пример защищённого роута
router.get('/api/tickets/sla/overdue',
  authenticateToken,      // 1. Проверить JWT
  requireRole('admin'),     // 2. Проверить роль (admin+)
  auditLog('sla_view'),   // 3. Залогировать действие
  getOverdueTickets        // 4. Контроллер
);
```

---

## База данных

### Схема Prisma (17 моделей)

```prisma
model Employee {
  id          Int      @id @default(autoincrement())
  email       String   @unique
  password    String
  firstName   String
  lastName    String
  role        Role     // super_admin | admin | senior_agent | agent
  department  String?
  isOnline    Boolean  @default(false)
  isBlocked   Boolean  @default(false)
  createdAt   DateTime @default(now())

  tickets     Ticket[]
  messages    Message[]
  notifications Notification[]
  auditLogs   AuditLog[]
}

model Ticket {
  id            Int      @id @default(autoincrement())
  title         String
  description   String   @db.Text
  status        Status   @default(open) // open | in_progress | resolved | closed
  priority      Priority @default(medium) // low | medium | high | critical
  dueAt         DateTime?
  firstResponseAt DateTime?
  resolvedAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  requesterId   Int
  assigneeId    Int?

  requester     Employee @relation("RequesterTickets", fields: [requesterId], references: [id])
  assignee      Employee? @relation("AssigneeTickets", fields: [assigneeId], references: [id])
  messages      TicketMessage[]
  attachments   Attachment[]
}

model TicketMessage {
  id        Int      @id @default(autoincrement())
  content   String   @db.Text
  isInternal Boolean @default(false)
  createdAt DateTime @default(now())

  ticketId  Int
  authorId  Int

  ticket    Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author    Employee @relation(fields: [authorId], references: [id])
}

model Chat {
  id        Int      @id @default(autoincrement())
  name      String?
  type      ChatType @default(general) // general | personal
  createdAt DateTime @default(now())

  messages  ChatMessage[]
  participants ChatParticipant[]
}

model ChatMessage {
  id        Int      @id @default(autoincrement())
  content   String   @db.Text
  reactions Json?    // { "👍": [1, 2], "❤️": [3] }
  createdAt DateTime @default(now())

  chatId    Int
  authorId  Int

  chat      Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
  author    Employee @relation(fields: [authorId], references: [id])
}

model WikiArticle {
  id        Int      @id @default(autoincrement())
  title     String
  content   String   @db.LongText
  category  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  authorId  Int
  author    Employee @relation(fields: [authorId], references: [id])
}

model NewsItem {
  id        Int      @id @default(autoincrement())
  title     String
  content   String   @db.Text
  isImportant Boolean @default(false)
  createdAt DateTime @default(now())

  authorId  Int
  author    Employee @relation(fields: [authorId], references: [id])
}

model CalendarEvent {
  id        Int      @id @default(autoincrement())
  title     String
  date      DateTime
  createdAt DateTime @default(now())
}

model Poll {
  id        Int      @id @default(autoincrement())
  question  String
  options   Json     // ["Option 1", "Option 2"]
  votes     Json     // { "Option 1": [1, 2], "Option 2": [3] }
  createdAt DateTime @default(now())
}

model FileItem {
  id        Int      @id @default(autoincrement())
  name      String
  path      String
  mimeType  String
  size      Int
  folderId  Int?
  createdAt DateTime @default(now())
}

model Notification {
  id        Int      @id @default(autoincrement())
  type      String   // in_app | email | telegram
  title     String
  message   String
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())

  employeeId Int
  employee   Employee @relation(fields: [employeeId], references: [id])
}

model AuditLog {
  id        Int      @id @default(autoincrement())
  action    String
  entity    String
  entityId  Int?
  details   Json?
  ipAddress String?
  createdAt DateTime @default(now())

  employeeId Int
  employee   Employee @relation(fields: [employeeId], references: [id])
}

model Settings {
  id        Int      @id @default(autoincrement())
  key       String   @unique
  value     Json
  updatedAt DateTime @updatedAt
}
```

### Индексы

```sql
-- FULLTEXT для глобального поиска
CREATE FULLTEXT INDEX ft_tickets ON Ticket(title, description);
CREATE FULLTEXT INDEX ft_wiki ON WikiArticle(title, content);
CREATE FULLTEXT INDEX ft_news ON NewsItem(title, content);
CREATE FULLTEXT INDEX ft_employees ON Employee(firstName, lastName, email);
CREATE FULLTEXT INDEX ft_chats ON Chat(name);
CREATE FULLTEXT INDEX ft_files ON FileItem(name);

-- Производительность
CREATE INDEX idx_tickets_status ON Ticket(status);
CREATE INDEX idx_tickets_assignee ON Ticket(assigneeId);
CREATE INDEX idx_tickets_priority ON Ticket(priority);
CREATE INDEX idx_tickets_due ON Ticket(dueAt);
CREATE INDEX idx_messages_ticket ON TicketMessage(ticketId);
CREATE INDEX idx_messages_chat ON ChatMessage(chatId);
CREATE INDEX idx_notifications_employee ON Notification(employeeId, isRead);
CREATE INDEX idx_audit_employee ON AuditLog(employeeId);
CREATE INDEX idx_audit_action ON AuditLog(action, createdAt);
```

---

## Real-time (WebSocket)

### Аутентификация handshake

```javascript
// Client
const socket = io('ws://localhost:4000', {
  auth: { token: localStorage.getItem('accessToken') }
});

// Server — middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication error'));
    socket.employeeId = decoded.id;
    socket.role = decoded.role;
    next();
  });
});
```

### Комнаты и эмиты

| Комната | Назначение | Эмиты |
|---|---|---|
| `chat:{id}` | Чат | `message:new`, `message:removed`, `message:reaction` |
| `ticket:{id}` | Тикет | `ticket:updated`, `ticket:message` |
| `employee:{id}` | Личные уведомления | `notification:new` |
| `online` | Онлайн-статус | `user:online`, `user:offline` |

### Rate Limiting

```javascript
// 5 сообщений/сек, exponential backoff
const RATE_LIMIT = 5; // msg/sec
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF = 60000; // 60s

// При превышении: socket.emit('rateLimit:warning', { retryAfter })
```

---

## SLA и эскалация

### SLA Policy

Матрица = базовое время (SLA_RESPONSE_HOURS) × множитель приоритета × множитель категории:

| Приоритет | Множитель | Пример (base=4ч) |
|---|---|---|
| Critical | 0.5× | 2 ч |
| High | 1× | 4 ч |
| Medium | 2× | 8 ч |
| Low | 4× | 16 ч |

| Категория | Множитель |
|---|---|
| Incident | 0.5× |
| Bug | 0.75× |
| Support | 1× |
| Feature | 2× |
| Other | 1× |

Итоговое время = base × priorityMult × categoryMult (минимум 1 час).

### Автоназначение (AUTO_ASSIGN)

```javascript
// Выбор наименее загруженного agent/senior_agent
async function getLeastLoadedAssignee() {
  return prisma.employee.findFirst({
    where: {
      role: { in: ['agent', 'senior_agent'] },
      isBlocked: false,
    },
    orderBy: {
      tickets: { _count: 'asc' }  // Prisma count relation
    },
    select: { id: true, firstName: true, lastName: true }
  });
}
```

### Фоновая проверка просрочек

```javascript
// Каждые 15 минут
setInterval(async () => {
  const overdue = await prisma.ticket.findMany({
    where: {
      status: { notIn: ['resolved', 'closed'] },
      dueAt: { lt: new Date() }
    }
  });

  for (const ticket of overdue) {
    // Дедупликация: 24 часа
    const lastEscalation = await cache.get(`escalation:${ticket.id}`);
    if (lastEscalation && Date.now() - lastEscalation < 24 * 60 * 60 * 1000) continue;

    await notify.escalate(ticket);
    await cache.set(`escalation:${ticket.id}`, Date.now(), 86400);
  }
}, 15 * 60 * 1000);
```

---

## Файловое хранилище

### Storage Adapter Pattern

```javascript
// storage.js — единый интерфейс
class StorageAdapter {
  async upload(file, key) { }
  async getUrl(key) { }
  async delete(key) { }
}

// S3/MinIO реализация (при S3_ENDPOINT)
class S3Storage extends StorageAdapter {
  // AWS SDK v3 или MinIO client
}

// Локальная реализация (fallback)
class LocalStorage extends StorageAdapter {
  // uploads/ директория
}

// Фабрика
function createStorage() {
  return process.env.S3_ENDPOINT 
    ? new S3Storage() 
    : new LocalStorage();
}
```

### Валидация загрузки

```javascript
// Multer конфигурация
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/', 'application/pdf', 'text/'];
    if (allowed.some(type => file.mimetype.startsWith(type))) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Magic bytes проверка (file-type)
const fileType = await fileTypeFromBuffer(buffer);
if (!fileType || !allowedMimeTypes.includes(fileType.mime)) {
  throw new Error('File type mismatch');
}

// ClamAV сканирование (опционально)
if (process.env.CLAMAV_ENABLED === 'true') {
  const clamscan = await new NodeClam().init();
  const { isInfected } = await clamscan.scanBuffer(buffer);
  if (isInfected) throw new Error('Virus detected');
}
```

---

## Уведомления

### Единый сервис notify.js

```javascript
// notify.js
async function notify({ type, recipients, title, message, ticketId }) {
  // In-app
  await createInAppNotification(recipients, title, message);

  // Email (async, не блокирует)
  if (settings.emailEnabled) {
    sendEmail(recipients, title, message).catch(err => logger.error(err));
  }

  // Telegram (async)
  if (settings.telegramEnabled) {
    sendTelegram(recipients, message).catch(err => logger.error(err));
  }

  // Web Push (async)
  if (settings.pushEnabled) {
    sendPush(recipients, title, message).catch(err => logger.error(err));
  }
}
```

### Автотриггеры

| Событие | Уведомляемые | Каналы |
|---|---|---|
| Тикет создан | senior_agent+, назначенный | in-app, email |
| Статус изменён | участники тикета | in-app |
| Приоритет повышен | assignee, senior_agent+ | in-app, email, telegram |
| Назначение | новый assignee | in-app, email |
| Новое сообщение | участники чата (кроме автора) | in-app |
| SLA просрочен | assignee, senior_agent+ | email, telegram |

---

### Meilisearch (fuzzy search)

Опциональный поисковый движок с поддержкой:
- **Fuzzy search** — опечатки и неточности
- **Typo tolerance** — поиск с ошибками
- **Faceted search/filtering**
- **Мгновенная индексация** при CRUD операциях

### Настройка

```yaml
# docker-compose.yml (уже добавлен)
meilisearch:
  image: getmeili/meilisearch:v1.8
  ports:
    - "7700:7700"
```

```bash
# .env
MEILISEARCH_URL=http://localhost:7700
MEILI_MASTER_KEY=meilisearch-master-key
```

### Архитектура

```
MySQL ──► search-sync.js ──► Meilisearch
                │
                └── fullSync() — при старте сервера
                └── syncEntity() — при CRUD (upsert/delete)

Client ──► GET /api/search?q= ──► Meilisearch (если доступен)
                                    │ fallback
                                    └──► MySQL FULLTEXT
                                           │ fallback
                                           └──► MySQL LIKE
```

### Индексы

| Индекс | Поля | Первичный ключ |
|--------|------|----------------|
| `tickets` | title, description, status, priority, category | id |
| `employees` | name, email, department | id |
| `wiki` | title, content, category | id |
| `news` | title, content | id |
| `chats` | name | id |
| `files` | name | id |

Без Meilisearch — прозрачный fallback на FULLTEXT → LIKE.

---

## Кэширование

### MySQL Read Replicas (docker-compose)

В docker-compose настроена репликация primary → replica:

- **Primary** (`mysql`): `server_id=1`, binlog включён, порт `3307`
- **Replica** (`mysql_replica`): `server_id=2`, `read_only=1`, порт `3308`
- Автоматическая настройка через `mysql/init-replica.sh`
- Пользователь `replicator` с правами `REPLICATION SLAVE`

> **Важно**: Prisma Free не поддерживает read replicas нативно.
> Для использования реплики в Node.js нужен отдельный PrismaClient
> с URL реплики и middleware для роутинга read-запросов.

### Автоматические бэкапы (docker-compose)

Сервис `db_backup` на базе `alpine`:
- `mysqldump` каждые 24 часа → `/backup/servicedesk_YYYYMMDD_HHMMSS.sql`
- Хранение 7 дней (`-mtime +7 -delete`)
- Volume `mysql_backup` для персистентности

Также доступен ручной запуск:
```bash
docker exec sd-mysql mysqldump -u root -p servicedesk > backup.sql
```

### Cache Adapter

```javascript
// cache.js — Redis / in-memory fallback
class Cache {
  async get(key) { }
  async set(key, value, ttlSeconds) { }
  async del(key) { }
  async delPattern(pattern) { }
}

// Redis при REDIS_URL, иначе Map
```

### Применение

| Endpoint | TTL | Инвалидация |
|---|---|---|
| `GET /api/tickets` | 120s | POST/PUT/DELETE /api/tickets |
| `GET /api/employees` | 300s | POST/PUT/DELETE /api/employees |
| `GET /api/wiki` | 600s | POST/PUT/DELETE /api/wiki |

```javascript
// Пример с кэшем
router.get('/api/tickets', async (req, res) => {
  const cacheKey = `tickets:${JSON.stringify(req.query)}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.json({ success: true, data: cached });

  const tickets = await ticketsService.list(req.query);
  await cache.set(cacheKey, tickets, 120);
  res.json({ success: true, data: tickets });
});

// Инвалидация при мутации
router.post('/api/tickets', async (req, res) => {
  const ticket = await ticketsService.create(req.body);
  await cache.delPattern('tickets:*');
  res.json({ success: true, data: ticket });
});
```

---

## Тестирование

### Структура тестов

```
client/__tests__/
├── auth.test.tsx              # Логин, регистрация, валидация
├── tickets.test.tsx           # Список, создание, фильтры
├── dashboard.test.tsx         # Виджеты, графики
├── chats.test.tsx             # Сообщения, реакции
├── wiki.test.tsx              # Статьи, поиск
├── news.test.tsx              # Лента, фильтры
├── calendar.test.tsx          # События, навигация
├── files.test.tsx             # Загрузка, drag&drop
├── employees.test.tsx         # Список, поиск
├── polls.test.tsx             # Голосование
├── search.test.tsx            # Глобальный поиск
├── notifications.test.tsx     # Уведомления
├── i18n.test.tsx              # Переключение языка
└── setup.ts                   # MSW handlers

server/__tests__/
├── api.test.js                # Integration: auth, RBAC, search, push
├── chats.service.test.js      # Service layer
├── employees.service.test.js
├── news.service.test.js
└── calendar.service.test.js
```

### Покрытие (v8)

```json
{
  "statements": 20,
  "branches": 15,
  "functions": 15,
  "lines": 25
}
```

> **Примечание**: Пороги установлены низкими из-за отсутствия тестов на UI-компоненты. Этап I выполнен: 71 клиентский + 93 серверных теста.

---

## Логирование и мониторинг

### Winston конфигурация

```javascript
// logger.js
const logger = winston.createLogger({
  levels: { error: 0, warn: 1, info: 2, debug: 3 },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 10 * 1024 * 1024,  // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5
    })
  ]
});
```

### Sentry

```javascript
// Frontend
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1,
});

// Backend
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [Sentry.httpIntegration()],
  tracesSampleRate: 0.1,
});
```

### Request ID

Каждый запрос получает UUID (`X-Request-Id`), который пробрасывается через:
- HTTP заголовки
- Логи Winston
- Sentry контекст

---

## Инфраструктура

### Docker Compose (Production)

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: service_desk
    volumes:
      - mysql_data:/var/lib/mysql
      - ./server/prisma/seed.sql:/docker-entrypoint-initdb.d/seed.sql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  api:
    build:
      context: ./server
      dockerfile: Dockerfile
      target: production
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mysql://root:${MYSQL_ROOT_PASSWORD}@mysql:3306/service_desk
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      mysql:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: .
      dockerfile: server/docker/Dockerfile.nginx
    ports:
      - "80:80"
    depends_on:
      - api

volumes:
  mysql_data:
  redis_data:
```

### Kubernetes

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: service-desk

# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: service-desk-config
  namespace: service-desk
data:
  NODE_ENV: "production"
  API_PORT: "4000"

# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: service-desk-secrets
  namespace: service-desk
type: Opaque
stringData:
  JWT_SECRET: "..."
  DATABASE_URL: "..."

# api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: service-desk
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: service-desk-api:latest
        ports:
        - containerPort: 4000
        envFrom:
        - configMapRef:
            name: service-desk-config
        - secretRef:
            name: service-desk-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: service-desk-ingress
  namespace: service-desk
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: service-desk.company.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api
            port:
              number: 4000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

---

## API Response Format

### Успешный ответ

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "...",
    "status": "open"
  }
}
```

### Пагинированный ответ

```json
{
  "success": true,
  "data": {
    "data": [...],
    "total": 150,
    "page": 1,
    "totalPages": 15
  }
}
```

### Ошибка

```json
{
  "success": false,
  "message": "Ticket not found"
}
```

### Ошибка валидации

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "title", "message": "Required" },
    { "field": "priority", "message": "Invalid enum value" }
  ]
}
```

---

## Известный технический долг

### Выполненные рекомендации (по аудиту Kimi)

По результатам внешнего аудита (оценка 7.7/10 → 8.5/10) выполнены:

| Рекомендация | Статус |
|---|---|
| Повышение покрытия тестов (47→71 client, 93 server, 13→22 E2E) | ✅ |
| TanStack Query (замена Context API) | ✅ |
| Meilisearch (fuzzy search вместо MySQL FULLTEXT) | ✅ |
| Skeleton loaders для всех списков | ✅ |
| Prometheus/Grafana метрики | ✅ |
| Роль requester (видит только свои тикеты) | ✅ |

### Оставшийся технический долг

| Этап | Задача | Приоритет | Статус |
|---|---|---|---|
| E | SLA policy-матрица по категориям (bug/feature/support/incident) | Medium | ✅ Выполнено |
| F | Роль requester (видит только свои тикеты) | Medium | ✅ Выполнено |
| G | TanStack Query + optimistic updates | Medium | ✅ Выполнено |
| H | Skeleton loaders для всех списков | Low | ✅ Выполнено |
| I | Покрытие тестов 50%+ | High | ✅ (93 серверных ✅ / 71 клиентский ✅) |
| I | E2E: эскалация SLA, автоназначение, экспорт | Medium | 🟡 Запланировано |
| J | Volume для MySQL-бэкапов в docker-compose | Low | ✅ Выполнено |
| J | Healthcheck всех сервисов | Low | ✅ Выполнено |
| J | Prometheus/Grafana метрики | Low | ✅ Выполнено |
| K | API versioning (/api/v1/) | Low | ❌ Не реализовано |
| K | BullMQ вместо setInterval (фоновые задачи) | Medium | ❌ Не реализовано |

---

*Документация актуальна на 2026-07-10. Версия проекта: 1.0.0*
