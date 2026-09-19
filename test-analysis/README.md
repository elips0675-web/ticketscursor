# Service Desk — Файлы для AI-анализа (Kimi / DeepSeek / Qwen)

## Стек
React 19 + TypeScript 5 + Vite 8 + Tailwind v4 + shadcn/ui | Express 5 + Prisma + MySQL 8 + Socket.IO + Redis

## Текущее состояние (после исправлений 19.09.2026, этап 2)

| Метрика | Значение |
|---------|----------|
| Frontend тесты | **52 файла / 411 тестов** ✅ |
| Серверные тесты | **30 файлов / 451 тестов** ✅ |
| E2E тесты | **16 spec'ов** (включая user-flow: login, CRUD, navigation, search) ✅ |
| E2E (check-console) | **17/17 страниц** ALL OK ✅ |
| TypeScript | **0 errors** ✅ |
| ESLint | **0 errors**, 11 warnings (pre-existing) ✅ |
| Vite build | **OK** ✅ |
| Coverage (клиент) | 71% stmts |
| Coverage (сервер) | 71% stmts |

### Исправлено 19.09.2026 (этап 1 + этап 2)

**Этап 1 (μίξη):**
- `vitest`, `supertest` перенесены в `devDependencies` (server/package.json)
- `@tailwindcss/postcss` дубликат убран (остался в devDependencies)
- Версия `package.json` синхронизирована с CHANGELOG (1.0.0 → 1.9.0)
- Удалены временные файлы (temp-login.mjs, login-body.json)

**Этап 2 (тесты + аудит):**
- E2E тесты: создан `user-flow.spec.ts` (8 тестов: login, CRUD, navigation, search)
- Kanban.test.tsx: 3→17 тестов (rendering, display, drag-drop, navigation, priority)
- Files route тесты: `files.route.test.js` (+7 тестов)
- Push route тесты: `push.test.js` (+8 тестов)
- localStorage fix для vitest 4.x + Node 24 (`setup.ts`)
- ORM: Prisma chosen (100+ vs Knex 3 call sites)
- README/AGENTS.md/context.txt обновлены

### Фактическая проверка AI-аудитов

| Проблема по аудиту | Kimi (6.5/10) | Qwen (8.5/10) | Факт |
|-------------------|--------------|--------------|------|
| ~200 stub-тестов | ✅ Основная претензия | Не упомянул | **Нет stub-тестов.** `src/hooks/` — пустая директория. `frontend-tests.txt` содержит несуществующие пути |
| E2E smoke-only | ✅ Подтвердил | ✅ Подтвердил | **Исправлено** — добавлен `user-flow.spec.ts` (8 тестов) |
| Два ORM (Prisma+Knex) | ✅ Подтвердил | ✅ Подтвердил | **Решено** — Prisma chosen, Knex → deprecated |
| CI cmd/c | ✅ Подтвердил | Не упомянул | **Уже исправлено** до аудита |
| Coverage 71% | Не упомянул | ✅ "Целевой 80%" | Верно — P2 задача |
| npm audit отсутствует | Не упомянул | ✅ Рекомендовал | Верно — P3 задача |

---

## Структура папки

| Файл | Что содержит | Размер |
|------|-------------|--------|
| **e2e-tests.txt** | 16 Playwright-файлов — login, tickets, chats, admin, kanban, files, search, notifications, profile, calculator, ldap, sla, **user-flow** | 9 KB |
| **server-tests.txt** | 30 серверных тестов (451 тест) — api, assistant, cache, middleware, time, sla, mentions, search, socket, notify, background, wiki, **files.route, push** | 16 KB |
| **frontend-tests.txt** | 52 фронтенд-теста (411 тестов) — все реальные тесты с осмысленной логикой | 61 KB |
| **load-tests.txt** | k6 (chat, tickets) + Artillery конфиг | 3 KB |
| **infra.txt** | CI/CD (ci.yml), Docker (Dockerfile, docker-compose.yml, entrypoint.sh), Nginx, скрипты | 14 KB |
| **AGENTS.md** | Правила разработки, known pitfalls, roadmap этапов 1-30 | 29 KB |
| **CHANGELOG.md** | История версий v0.1 → v1.9 | 31 KB |
| **context.txt** | Текущее состояние, coverage файлов, команды, аудит | 15 KB |
| **package.json** | Зависимости фронта (React 19, Vite 8, Tailwind v4, Vitest 4) — v1.9.0 | 3 KB |
| **server-package.json** | Зависимости сервера (Express 5, Prisma, MySQL, Socket.IO) — v1.9.0, vitest/supertest в devDependencies | 2 KB |
| **tsconfig.json** | TypeScript конфигурация | 0.1 KB |
| **vitest.client.config.ts** | Конфиг клиентских тестов (jsdom, coverage thresholds 71/61/61/74) | 1 KB |
| **Что-доделать.txt** | План доработок по результатам 3 AI-аудитов + фактическая проверка | 6 KB |

**Итого: 14 файлов, ~192 KB**

---

## Оценки AI-анализаторов (фактическая проверка)

| AI | Оценка | Ключевая претензия | Факт |
|----|--------|-------------------|------|
| **Kimi** | 6.5/10 | "~300 stub-тестов в src/hooks/\_\_tests\_\_/" | **Ошибся.** `src/hooks/` — пустая директория. Все 411 тестов реальные |
| **Qwen** | 8.5/10 | "Проеct крепкий, двойной ORM — главная проблема" | **Верно.** Лучшая оценка, корректный roadmap |
| **DeepSeek** | 7/10 | (файл аудита не сохранён) | Оценка ссылочная |

### Консенсус
- ✅ Архитектура и стек — сильные (8-9/10)
- ✅ Серверные тесты — качественные интеграционные (451)
- ✅ E2E — расширены до user-flow (16 spec'ов)
- ⚠️ Два ORM — Prisma chosen, миграция Knex → P2
- ⚠️ Coverage 71% — целевой 80% (P2)

---

## Как использовать для AI-анализа

1. **Kimi / DeepSeek / Qwen**: скинуть папку `test-analysis/` целиком
2. **Prompt**: "Проанализируй тестовое покрытие и найди баги/улучшения"
3. **Фокус**:
   - `e2e-tests.txt` — user flows (Playwright)
   - `server-tests.txt` — API контракты, бизнес-логика
   - `frontend-tests.txt` — UI логика, компоненты
   - `Что-доделать.txt` — что уже исправлено, что осталось
