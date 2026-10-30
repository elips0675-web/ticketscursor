# 10 — Гейты: что запускать после правки

Карта «изменённые файлы → обязательные команды» уже автоматизирована: `npm run stage:gates` (читает git diff и печатает список). Пользуйся ей, а не памятью.

## Обязательный минимум после любой правки кода

```
npm run lint
npm run type-check
```

## По типу изменения

| Изменено | Обязательно |
|---|---|
| `src/**/*.ts(x)` | `npm test`, `npm run build` |
| `src/**/*.ts(x)` | дополнительно `npm run check:console` — если поднят стенд (server:3002 + preview:8081) |
| `server/src/**` | `cd server && npm test` |
| `server/migrations/**`, `server/prisma/**` | `npm run check:migrations-lag`, `npm run check:schema-drift`, `cd server && npm test` |
| `server/seed.sql`, `server/test-db-setup.js` | `npm run check:schema-drift` |
| `e2e/**` | `npx playwright test` (нужен MySQL; `scripts/e2e-db-setup.mjs`) |
| `scripts/**/*.mjs`, `check-console.mjs` | `npm test` (скрипты покрыты `scripts/**/*.test.mjs`) |
| `*.md`, `*.txt` (журналы/доки) | `npm run check:docs` |
| `nginx.conf`, `vercel.json` | `npm run check:headers` |
| `docker-compose*`, `Dockerfile`, `.dockerignore` | `npm run check:headers`, `npm run check:compose-logging` |
| `package.json`, `package-lock.json` | `npm test`, `cd server && npm test` |

## Смысл гейтов (не обходить, а понимать)

- `npm run check:docs` = `check-doc-sync` + `check-backlog-closed-body` + `check-doc-counters` + `check-backlog-schema`. Падает на: рассинхроне зеркал `test-analysis/`, «надгробиях» в бэклоге, протухших счётчиках тестов, сдвиге колонок таблиц.
- `npm run check:backlog` — схема бэклога: лимит 450 строк / 90 000 байт, ID формата `P1-09`, число ячеек = шапке.
- `npm run check:console` — Playwright-обход 26 страниц: нет `console.error`/`pageerror`, есть русский текст (`[OK/RU]`), итог `ALL OK`.
- `npm run stage:preflight` — быстрые гейты ДО правок (docs + lint + type-check), exit 1 при красном.

## Окружение

- Node в этой машине лежит в `C:\laragon\bin\nodejs\node-v22` (в системном PATH его нет). `.vscode/settings.json` уже добавляет этот путь в новые терминалы и переключает профиль на **Command Prompt**.
- В PowerShell `npm` падает (`npm.ps1` запрещён политикой выполнения). Если терминал всё же PowerShell — вызывай `npm.cmd`, либо один раз разреши скрипты: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- Признак проблемы: `npm : Имя "npm" не распознано` или `выполнение сценариев отключено`. Не пытайся «починить» это правкой кода проекта.

## Правило отчёта

Ошибку гейта исправляешь ты, а не пользователь. В финальном ответе — команда + её итог (exit code / строка итога), плюс список изменённых файлов и заменённых типов (если были).
