# Service Desk — Файлы для AI-анализа (Kimi / DeepSeek / Qwen)

## Стек
React 19 + TypeScript 5 + Vite 8 + Tailwind v4 + shadcn/ui | Express 5 + Prisma + MySQL 8 + Socket.IO + Redis

## Текущее состояние (после исправлений 21.09.2026, этап 37)

| Метрика | Значение |
|---------|----------|
| Frontend тесты | **52 файла / 411 тестов** ✅ |
| Серверные тесты | **35 файлов / 523 тестов** ✅ |
| E2E тесты | **16 spec'ов** (включая user-flow: login, CRUD, navigation, search) ✅ |
| E2E (check-console) | **17/17 страниц** ALL OK ✅ |
| TypeScript | **0 errors** ✅ |
| ESLint | **0 errors**, 2 warnings (react-hooks/set-state-in-effect) ✅ |
| Vite build | **OK** ✅ |
| Coverage (клиент) | 71% stmts |
| Coverage (сервер) | 71% stmts |
| Prisma моделей | **25** (+api_tokens, webhooks, automation_rules, ticket_recurrences, feature_flags) |
| API endpoints | **90+** (+API tokens, Webhooks, Lock, Recurrences, Rules, SSO) |

### Исправлено 21.09.2026 (этап 36 — i18n фиксы)

**i18n — исправление корневой причины:**
- В `ru.json` и `en.json` были два ключа `"auth"` — второй перезаписывал первый, теряя все переводы авторизации
- Объединены два блока `auth` в один, все переводы восстановлены

**Русизация страниц:**
- `ForgotPassword.tsx` — добавлен `useTranslation`, все строки на `t()` ключах
- `ResetPassword.tsx` — добавлен `useTranslation`, все строки на `t()` ключах
- `SSO.tsx` — 7 сообщений ошибок заменены на `t()` ключи

**i18n ключи:**
- 25+ новых ключей: `forgotPassword.*`, `resetPassword.*`, `sso.error*`, `common.reset`

### Исправлено 21.09.2026 (этап 4 — важные фичи)

**Email Ingestion UI:**
- `AdminSettings.tsx` — ImapSection: IMAP настройки в админке (host/port/user/pass), тест соединения, статус
- i18n: 15 ключей `admin.imap*` в ru/en

**Webhooks + API-токены:**
- `api-tokens.service.js` — SHA-256 hash, prefix `sd_`, валидация, list, delete
- `webhooks.service.js` — 7 событий, HMAC SHA-256, retry 3x
- `middleware.js` — authenticateToken принимает JWT **или** API-токены
- `api-tokens.js` — GET/POST/DELETE /api/api-tokens
- `webhooks.js` — GET/POST/PUT/DELETE /api/webhooks (admin-only)
- `tickets.js` — webhook триггеры (created/updated/closed/assigned/message)
- `20260921_webhooks_api_tokens.sql` — миграция
- `AdminIntegrations.tsx` — UI для API-токенов и webhooks

**Command Palette (Cmd+K):**
- `CommandPalette.tsx` — навигация (11 страниц), поиск, быстрые действия
- `App.tsx` — добавлен CommandPalette в layout
- i18n: 6 ключей `commandPalette.*` в ru/en

### Фактическая проверка AI-аудитов

| Проблема по аудиту | Kimi (6.5/10) | Qwen (8.5/10) | Факт |
|-------------------|--------------|--------------|------|
| ~200 stub-тестов | ✅ Основная претензия | Не упомянул | **Нет stub-тестов.** `src/hooks/` — пустая директория. `frontend-tests.txt` содержит несуществующие пути |
| E2E smoke-only | ✅ Подтвердил | ✅ Подтвердил | **Исправлено** — добавлены `user-flow.spec.ts` (9 тестов) + `crud-lifecycle.spec.ts` (6 тестов) |
| Два ORM (Prisma+Knex) | ✅ Подтвердил | ✅ Подтвердил | **Решено** — Prisma chosen, Knex → deprecated |
| CI cmd/c | ✅ Подтвердил | Не упомянул | **Уже исправлено** до аудита |
| Coverage 71% | Не упомянул | ✅ "Целевой 80%" | Верно — P2 задача |
| npm audit отсутствует | Не упомянул | ✅ Рекомендовал | Верно — P3 задача |

---

## Структура папки

| Файл | Что содержит | Размер |
|------|-------------|--------|
| **e2e-tests.txt** | 16 Playwright-файлов — login, tickets, chats, admin, kanban, files, search, notifications, profile, calculator, ldap, sla, **user-flow**, **crud-lifecycle** | 11 KB |
| **server-tests.txt** | 35 серверных тестов (523 теста) — api, assistant, cache, middleware, time, sla, mentions, search, socket, notify, background, wiki, files.route, push, email, csat, custom-fields, calendar, employees, news, polls, roleUtils, wiki, socket, metrics | 16 KB |
| **frontend-tests.txt** | 52 фронтенд-тестов (411 тестов) — все реальные тесты с осмысленной логикой | 61 KB |
| **test-inventory.json** | Машинно-читаемый инвентарь всех тестов (87 файлов, 934 теста) — для автоматической верификации | 12 KB |
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
| **Qwen** | 8.2/10 | "Проект крепкий, двойной ORM — главная проблема" | **Частично верно.** Prisma+Knex: knex только для auto-migrate (документировано). Есть 1 реальное замечание — Redis нет в docker-compose |
| **DeepSeek** | 6.5/10 | «Документация лжёт о фиксах» (check-bundle-size, cmd/c, k6) | **Анализировал stale-копии** `test-analysis/` (server-package.json, infra.txt). По живому коду все P0-утверждения ложные — проверено строками файлов |

### Консенсус
- ✅ Архитектура и стек — сильные (8-9/10)
- ✅ Серверные тесты — качественные интеграционные (523)
- ✅ E2E — расширены до user-flow (16 spec'ов)
- ✅ Custom Fields — реализованы (Prisma schema + service + API + UI)
- ✅ SLA pause/business hours — реализованы
- ✅ CSAT — реализован
- ✅ i18n — исправлены дубли auth ключей, русификация ForgotPassword/ResetPassword/SSO
- ⚠️ Email ingestion — ~60% (service + route + background + tests; reply threading + UI в процессе)
- ⚠️ Два ORM — Prisma chosen, миграция Knex → P2
- ⚠️ Coverage 71% — целевой 80% (P2)
- ✅ Все 934 теста проходят (клиент 411 + сервер 523), 0 failures

---

## Как использовать для AI-анализа

1. **Kimi / DeepSeek / Qwen**: скинуть папку `test-analysis/` целиком
2. **Prompt**: "Проанализируй тестовое покрытие и найди баги/улучшения"
3. **Фокус**:
   - `e2e-tests.txt` — user flows (Playwright)
   - `server-tests.txt` — API контракты, бизнес-логика
   - `frontend-tests.txt` — UI логика, компоненты
   - `Что-доделать.txt` — что уже исправлено, что осталось
