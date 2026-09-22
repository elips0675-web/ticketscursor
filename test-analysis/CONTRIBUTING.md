# Contributing — Service Desk

> Спасибо за интерес к проекту! Это руководство поможет вам внести вклад.

---

## 📋 Содержание

1. [Кодекс поведения](#кодекс-поведения)
2. [Как внести вклад](#как-внести-вклад)
3. [Настройка окружения](#настройка-окружения)
4. [Структура веток](#структура-веток)
5. [Стандарты кода](#стандарты-кода)
6. [Тестирование](#тестирование)
7. [Commit сообщения](#commit-сообщения)
8. [Pull Request](#pull-request)
9. [Сообщество](#сообщество)

---

## Кодекс поведения

- Будьте уважительны и конструктивны
- Принимайте конструктивную критику
- Фокусируйтесь на том, что лучше для проекта и сообщества
- Проявляйте эмпатию к другим участникам

---

## Как внести вклад

### Сообщить о баге

1. Проверьте, не создан ли уже Issue для этого бага
2. Создайте новый Issue с тегом `bug`
3. Используйте шаблон:
   - **Описание**: что происходит
   - **Шаги воспроизведения**: пошагово
   - **Ожидаемое поведение**: что должно было произойти
   - **Фактическое поведение**: что произошло на самом деле
   - **Окружение**: OS, браузер, Node.js версия
   - **Скриншоты / логи**: если применимо

### Предложить фичу

1. Проверьте, нет ли уже похожего Issue
2. Создайте Issue с тегом `enhancement`
3. Опишите:
   - Проблему, которую решает фича
   - Предлагаемое решение
   - Альтернативы (если есть)
   - Можете ли вы помочь с реализацией

### Исправить баг / Реализовать фичу

1. Форкните репозиторий
2. Создайте ветку от `main` (см. [структуру веток](#структура-веток))
3. Внесите изменения
4. Напишите/обновите тесты
5. Убедитесь, что все тесты проходят
6. Создайте Pull Request

---

## Настройка окружения

### Требования

- Node.js 18+
- MySQL 8.4+ (или Docker)
- Git

### Быстрый старт

```bash
# 1. Форк и клон
git clone https://github.com/YOUR_USERNAME/ticketsCursor.git
cd ticketsCursor

# 2. Установка зависимостей
npm install
cd server && npm install && cd ..

# 3. Переменные окружения
cp server/.env.example server/.env
# Отредактируйте DATABASE_URL, JWT_SECRET

# 4. База данных
cd server
npx prisma migrate dev
npx prisma db seed
cd ..

# 5. Запуск
cd server && npm run dev      # API :4000
cd .. && npm run dev          # Frontend :5173
```

### Docker (альтернатива)

```bash
docker compose up -d --build
# → http://localhost
```

---

## Структура веток

```
main                    # Стабильная production-ветка
├── develop             # Ветка разработки (опционально)
├── feature/xxx         # Новые фичи
├── bugfix/xxx          # Исправления багов
├── hotfix/xxx          # Срочные исправления
└── refactor/xxx        # Рефакторинг
```

### Правила именования

```
feature/ticket-sla-matrix      # Новая фича
bugfix/login-redirect-loop     # Исправление бага
hotfix/security-patch          # Срочный фикс
refactor/ticket-service        # Рефакторинг
```

---

## Стандарты кода

### TypeScript (Frontend + Backend)

- **Strict mode** — без `any`
- **Explicit types** — типизируйте параметры функций и возвращаемые значения
- **No implicit returns** — всегда возвращайте значение или `void`

```typescript
// ✅ Хорошо
async function getTicketById(id: number): Promise<Ticket | null> {
  return prisma.ticket.findUnique({ where: { id } });
}

// ❌ Плохо
async function getTicketById(id) {
  return prisma.ticket.findUnique({ where: { id } });
}
```

### React

- **Функциональные компоненты** — только hooks, никаких классов
- **Custom hooks** — выносите логику в хуки
- **Memoization** — используйте `useMemo` / `useCallback` для тяжёлых вычислений

```tsx
// ✅ Хорошо
function TicketList({ tickets }: TicketListProps) {
  const sortedTickets = useMemo(
    () => tickets.sort((a, b) => b.priority - a.priority),
    [tickets]
  );

  return (
    <ul>
      {sortedTickets.map(ticket => (
        <TicketItem key={ticket.id} ticket={ticket} />
      ))}
    </ul>
  );
}
```

### Backend

- **Чистая архитектура**: routes → services → repositories
- **Тонкие контроллеры**: только валидация + вызов сервиса + response
- **Единый формат ответа**:

```javascript
// Успех
{ success: true, data: ticket }

// Ошибка
{ success: false, message: 'Ticket not found' }
```

- **Zod валидация** на всех входных данных
- **Не пишите бизнес-логику в контроллерах**

```javascript
// ✅ Хорошо — тонкий контроллер
router.post('/api/tickets', validate(createTicketSchema), async (req, res) => {
  const ticket = await ticketsService.create(req.body);
  res.json({ success: true, data: ticket });
});

// ❌ Плохо — логика в контроллере
router.post('/api/tickets', async (req, res) => {
  const { title, description, priority } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  // ... 50 строк бизнес-логики
});
```

### Именование

| Сущность | Стиль | Пример |
|---|---|---|
| Компоненты React | PascalCase | `TicketDetail.tsx` |
| Хуки | camelCase + `use` | `useTicketForm.ts` |
| Утилиты | camelCase | `formatDate.ts` |
| API роуты | kebab-case | `tickets.routes.js` |
| Сервисы | camelCase + `Service` | `tickets.service.js` |
| Константы | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| БД таблицы | snake_case | `ticket_messages` |
| Prisma модели | PascalCase | `TicketMessage` |

---

## Тестирование

### Запуск тестов

```bash
# Клиентские тесты
npm run test

# Серверные тесты
cd server && npm run test

# E2E тесты
npx playwright test

# С покрытием
npm run test:coverage
```

### Правила написания тестов

- **AAA**: Arrange → Act → Assert
- **Один assert на тест** (желательно)
- **Описательные названия**: "should create ticket with valid data"
- **Mock внешние зависимости**: MSW для API, mock для Socket.io

```typescript
// ✅ Хорошо
describe('TicketService', () => {
  it('should create ticket with valid data', async () => {
    // Arrange
    const data = { title: 'Test', priority: 'high' };

    // Act
    const ticket = await ticketsService.create(data);

    // Assert
    expect(ticket.title).toBe('Test');
    expect(ticket.priority).toBe('high');
    expect(ticket.status).toBe('open');
  });

  it('should throw on missing title', async () => {
    await expect(ticketsService.create({})).rejects.toThrow('Title required');
  });
});
```

### Покрытие

Целевые пороги:
- Statements: 50%+
- Branches: 40%+
- Functions: 40%+
- Lines: 50%+

---

## Commit сообщения

### Формат (Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Типы

| Тип | Описание |
|---|---|
| `feat` | Новая фича |
| `fix` | Исправление бага |
| `docs` | Документация |
| `style` | Форматирование (без изменения логики) |
| `refactor` | Рефакторинг |
| `test` | Тесты |
| `chore` | Сборка, зависимости, CI |
| `perf` | Производительность |
| `security` | Безопасность |

### Примеры

```
feat(tickets): add SLA policy matrix by category

Implement deadline calculation based on ticket category
and priority level. Categories: bug, feature, support, incident.

Closes #123
```

```
fix(auth): resolve refresh token rotation bug

Refresh tokens were not invalidated after use, allowing
replay attacks. Now each refresh generates a new pair
and invalidates the old one.

Fixes #456
```

```
refactor(services): extract notification logic from controllers

Move all notify* calls to dedicated service layer.
Improves testability and separation of concerns.
```

---

## Pull Request

### Чеклист перед созданием PR

- [ ] Код соответствует стандартам (lint проходит)
- [ ] TypeScript strict mode — нет `any`
- [ ] Все тесты проходят
- [ ] Новый функционал покрыт тестами
- [ ] Документация обновлена (если нужно)
- [ ] Commit сообщения соответствуют Conventional Commits
- [ ] PR направлен в `main` (или `develop`)
- [ ] Нет конфликтов слияния

### Шаблон PR

```markdown
## Описание
Краткое описание изменений

## Тип изменения
- [ ] Bug fix
- [ ] Новая фича
- [ ] Рефакторинг
- [ ] Документация
- [ ] Тесты

## Как тестировать
1. Шаг 1
2. Шаг 2
3. Ожидаемый результат

## Связанные Issue
Fixes #123, Closes #456

## Скриншоты (если UI)
```

### Процесс ревью

1. Автоматические проверки (CI) должны быть зелёными
2. Минимум 1 approve от мейнтейнера
3. Все комментарии resolved
4. Сквош коммитов перед мержем (опционально)

---

## Сообщество

### Каналы связи

- **GitHub Issues**: баги и фичи
- **GitHub Discussions**: вопросы и идеи
- **Telegram**: [t.me/service_desk_dev](https://t.me/service_desk_dev) (опционально)

### Мейнтейнеры

| Имя | Роль | Контакт |
|---|---|---|
| @elips0675-web | Lead Developer | GitHub |

### Благодарности

Спасибо всем, кто внёс вклад в проект! Вы перечислены в [CONTRIBUTORS.md](./CONTRIBUTORS.md).

---

## Лицензия

Внося вклад, вы соглашаетесь с тем, что ваш код будет распространяться под лицензией [MIT](../LICENSE).

---

*Последнее обновление: 2026-07-10*
