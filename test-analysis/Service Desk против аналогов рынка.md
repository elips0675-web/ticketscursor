# Service Desk против аналогов рынка

> Сравнительный анализ продукта Service Desk с конкурентами (self-hosted, SaaS, российскими решениями), оценка стека и рекомендации по позиционированию.

---

## 1. Отличия: аналоги vs ваш продукт

**Категория продукта разная:** аналоги — это корпоративные мессенджеры/коммуникационные платформы (замена Slack/Mattermost/Teams), а ваш Service Desk — специализированная тикет-система (helpdesk).

| Фича аналогов | Есть в вашем Service Desk | Нужна ли тикет-системе |
|---|---|---|
| Видеозвонки/конференции (Frisbee 250, VK 300+, eXpress зеркало) | ❌ | Нет — нужен медиасервер (Janus/WebRTC SFU), это отдельный инфраструктурный проект |
| SIP-телефония, видеохостинг (FrisbeeTube) | ❌ | Нет — это совсем другой вертикальный продукт |
| E2E-шифрование, запрет скриншотов (eXpress) | ❌ (у вас есть Helmet, JWT, RBAC) | Нет — для внутреннего helpdesk'а не критично, а E2E в веб-чате — большой риск |
| Экосистемная интеграция (Dialog–Сбер, VK-экосистема) | Частично: Telegram-уведомления | Нет — завязка на замкнутую экосистему |
| Боты / ИИ-ассистент (Frisbee) | ❌ | Отчасти: можно ИИ-ответы на «как сделать X?» из Wiki — но это P2-фича |
| Задачи/проекты (VK Teams) | ✅ Тикеты + SLA + эскалация — глубже, чем в аналогах | Уже есть и сильнее |
| Каналы/треды/реакции (eXpress) | ✅ Чаты, реакции, typing, online | Уже есть |
| Федерация (eXpress) | ❌ | Нет — это про распределённые инстансы, не про helpdesk |

**Обратная сторона:** ваш Service Desk глубже аналогов в той области, где они слабы — тикет-воркфлоу: VALID_TRANSITIONS, SLA (due_at, эскалация low→critical), автоматическое назначение на наименее загруженного, canned responses, RBAC из 5 ролей, экспорт CSV/PDF, FullText-поиск. Это и есть его ценность.

---

## 2. Что реально стоит в «что доделать»

Уже лежащий в context.txt техдолг — правильный и безопасный:

- **Mentions @username, tags/labels, bulk actions, time tracking** — это тикетные фичи, логично дополняют продукт
- **API versioning, read receipts, coverage** (search.js FULLTEXT, Files.tsx branch) — полировка стабильности

Они не требуют новых инфраструктурных компонентов (медиасерверы, WebRTC), не трогают ядро, покрываются тестами. Порядок добавления — по одному, с запуском `npm run test` + `cd server && npm test` + `npx tsc --noEmit` после каждого.

**Раздувать план аналоговыми фичами не стоит — это путь в «переросток».**

---

## 3. Аналоги helpdesk/ticket-систем

Аналогов вашей helpdesk/ticket-системы хватает. Вот основные, сгруппированные по типу.

### Open-source (self-hosted, как у вас)

- **Zammad** — самый близкий по функционалу: тикеты, чаты, база знаний (wiki), SLA, webhooks, omnichannel (email/telegram/telephony), RBAC, LDAP. Стек Ruby + PostgreSQL, есть Docker/K8s-гайды.
- **GLPI** — классика ITSM: тикеты, инвентаризация активов, SLA, календарь, опросы. PHP + MySQL/MariaDB — стек почти как у вас.
- **osTicket** — лёгкий тикетёр: SLA, автоответы, вложения, CSV-экспорт. Скромнее вашей системы (нет чатов и wiki из коробки).
- **UVdesk** — тикеты + база знаний, написан на Symfony (PHP). Community-версия бесплатна.
- **FreeScout** — self-hosted клон Help Scout: тикеты, ящики, модули (LDAP, API платно).
- **Hesk / HelpDeskZ** — простые минималистичные тикет-системы, если нужна лёгковесность.
- **Frappe Helpdesk** — современная open-source система тикетов с настраиваемыми SLA, правилами автоназначения и базой знаний. Написана на Python/JavaScript, развёртывание через Docker.
- **OTOBO / Znuny** — эволюция OTRS Community Edition. Гибкая веб-тикет-система для Customer Service, Help Desk и IT Service Management. Поддерживает SLA, RBAC и интеграции с LDAP/AD.
- **Redmine** — классический open-source трекер с поддержкой нескольких проектов, ролевого доступа, настраиваемых полей и очередей хелпдеска. Часто используется как база для ITSM-процессов в enterprise-среде.
- **Trudesk / Peppermint / Helpy** — менее крупные, но функциональные open-source хелпдески. Peppermint — альтернатива Zendesk и Jira, Trudesk — open-source help desk/ticketing решение.
- **ICTDesk** — open-source live support с WebSocket-чатом, многопользовательской поддержкой и white-label. Покрывает часть функций чатов и real-time взаимодействия.

### Коммерческие (SaaS)

- **Zendesk** — индустриальный стандарт: тикеты, чат, база знаний, SLA, триггеры/автоматизация.
- **Freshdesk** — похоже на Zendesk, но дешевле и проще.
- **Jira Service Management** — если компания уже в Atlassian-экосистеме.
- **Help Scout** — упор на простоту и качество поддержки клиентов.
- **HubSpot Service Hub** — если нужен CRM + тикеты в одном.
- **HaloITSM** — лидер среди ITSM-решений, Editors' Choice. Инцидент-менеджмент, управление запросами, AD-интеграция.
- **Freshservice** — облачная ITSM-платформа, ориентированная на простоту внедрения. Тикеты, SLA, база знаний, автоматизация, дашборды.
- **ManageEngine ServiceDesk Plus** — зрелое решение для среднего и крупного бизнеса. Инциденты, запросы, изменения, активы, SLA.
- **Zendesk / HappyFox / Vivantio** — фокус на омниканальность, AI-функции и удобство для агентов.

### Российские решения

- **Кайтен (Kaiten) Service Desk** — модуль Service Desk внутри российской системы управления задачами Kaiten. Альтернатива Okdesk и Юздеск. Приём заявок, преобразование обращений в тикеты, настройка обязательных полей, база знаний.
- **Okdesk** — российская SaaS-система для сервисных и IT-подразделений. HelpDesk, Service Desk, модули для выездных работ и CMMS.
- **Usedesk / HelpDeskEddy / Omnidesk** — облачные российские хелпдески, близкие к Zendesk, с интеграцией с российскими сервисами.
- **Radiant Service Desk** — open-source ITSM-решение, включённое в **реестр отечественного ПО**. На базе open-source компонентов, поддерживает процессы поддержки пользователей.
- **SimpleOne** — российская ITSM/ESM-платформа, альтернатива ServiceNow для крупных организаций.
- **Usedesk, Megaplan, ПланФикс** — российские варианты с русскоязычной поддержкой.

---

## 4. Что из вашего списка есть не у всех

- **LDAP/AD auto-provisioning** — есть у Zammad и GLPI, в osTicket через плагин
- **Real-time чаты** — у Zammad есть, у osTicket нет
- **Поиск типа Meilisearch** — ни у кого из open-source из коробки, у вас это сильная сторона
- **Kubernetes/Prometheus/Grafana готовые манифесты** — у Zammad есть официальный Helm chart

---

## 5. Сравнение аналогов и оценка выбранного стека

**По стеку вы почти уникальны среди аналогов** — почти все open-source helpdesk'и живут на других технологиях:

| Система | Стек | Близость к вашему |
|---|---|---|
| **Ваша** | Node/Express + Prisma + MySQL + Socket.IO + Redis | — |
| Zammad | Ruby on Rails + PostgreSQL + Elasticsearch | чужой стек полностью |
| GLPI | PHP + MariaDB | MySQL-близость есть, остальное нет |
| osTicket | PHP + MySQL | та же БД, нет real-time |
| UVdesk | PHP (Symfony) + MySQL | та же БД |
| FreeScout | PHP (Laravel) + MySQL | та же БД |
| Chatwoot | Ruby on Rails + Vue.js + Redis + WebSocket | ближе по архитектуре (Redis + WS), но Ruby/Vue |
| Trudesk | Node.js + Express + MongoDB + Socket.IO | ближайший по бэкенду, но MongoDB и UI без shadcn |
| Mattermost (+плагины) | Go + React + PostgreSQL | тикеты через плагины, Wiki, календарь, LDAP, PWA, K8s, Prometheus |
| Plane | Next.js + Django + PostgreSQL + Tailwind | современный UI/стек, но SLA и LDAP требуют доработки |

**Вывод:** из open-source helpdesk'ов ни один не написан на Node + Prisma + React. Это можно подавать как преимущество:

- **Единый язык TypeScript на фронте и бэке** — одна кодовая база типов (shared types через Prisma-generated типы)
- **Socket.IO + Redis adapter** — real-time уже в фундаменте, у PHP-аналогов это боль (long-polling костыли или внешние сервисы)
- **Prisma-миграции + MySQL 8** — предсказуемый DDL, чем raw SQL в PHP-проектах

### Оценка самого стека

- **Express + Socket.IO** — классика, десятки тысяч продакшн-систем
- **Prisma + MySQL 8** — норма, но для тикетов с активным поиском Prisma raw-запросы к FULLTEXT вы уже обходите через Meilisearch
- **Redis** — три роли у вас: кэш, Socket.IO adapter, BullMQ — правильное переиспользование, не overkill
- **shadcn/ui + Tailwind v4 + React 19** — актуальная связка, но следите: shadcn-компоненты часто отстают от мажорных релизов Radix, проверяйте совместимость после апгрейдов
- **Vite 8** — мажорные версии Vite несут breaking changes в plugin API; если используете много плагинов — lock-версии

**Единственное, что стоит пересмотреть:** при росте команды Express без строгой структуры (слоёв, DI) на 17 моделях Prisma требует дисциплины. Варианты: NestJS (та же экосистема, DI из коробки) или явный слой services/repositories (у вас он, судя по чек-листу, уже есть).

---

## 6. Прямых аналогов не существует — уникальная комбинация

Ваша система реализует уникальную комбинацию: **WebSocket-чаты внутри тикетов + Wiki + новости + календарь + опросы + PWA + Kubernetes**. Ни один из open-source аналогов не даёт этого «из коробки». (Tauri-конфиг удалён в Этапе 17 — мёртвый код вычищен.)

Найти один готовый open-source проект, точно повторяющий современный JS/TS-стек (React 19 + Vite + Tailwind v4 + shadcn/ui + Express + Prisma), практически невозможно — зрелые решения написаны на Ruby, PHP, Python или используют более старые версии React.

**Ближайшие по набору модулей и стеку:** Zammad, Frappe Helpdesk и GLPI.

### Есть два пути (если рассматривать замену готовым продуктом)

1. Выбрать базовую ITSM/хелпдеск-платформу (Zammad / Frappe Helpdesk) и доработать под свои процессы (чаты, wiki, опросы)
2. Либо использовать коммерческий SaaS (HaloITSM, Freshservice) с кастомизацией через API

---

## 7. Технические аналоги (фреймворки и бойлерплейты)

Если разрабатывать систему самому и избежать 80% рутинного кода (RBAC, аудит, таблицы, фильтрация, Prisma-интеграция):

**A. Headless-фреймворки для B2B/Enterprise**

- **Refine.dev** — React, Vite, Tailwind, shadcn/ui (поддерживается), Ant Design/MUI. Даёт из коробки: RBAC-провайдеры, Audit Log, интеграцию с REST/GraphQL (ваш Express), React Query (кэширование), хуки для таблиц с фильтрацией/сортировкой/пагинацией. Сокращает время разработки админ-панели и дашбордов.
- **React Admin** — аналог Refine, более зрелый, отлично работает с Data Provider для Prisma/Express.

**B. Современные стартер-киты (Boilerplates)**

- **create-t3-app** (с модификациями) — обычно Next.js, но адаптируется под Vite + Express. Даёт Prisma, Tailwind, tRPC.
- **Vite + Express + Prisma + shadcn/ui шаблоны** — vite-express-prisma-starter, shadcn-admin (готовая админ-панель на Vite + shadcn, куда подключается ваш Express-бэкенд).
- **Shadcn Admin Dashboard** — готовые шаблоны (kinde, preline) с тёмной темой, таблицами, формами и чартами (Recharts).

---

## 8. Функциональные Open-Source аналоги (готовые продукты)

| Система | Стек | Совпадение с вашими модулями |
|---|---|---|
| Zammad | Ruby on Rails, Vue.js, Elasticsearch | **Максимальное.** Тикеты, SLA, чаты, база знаний (Wiki), LDAP/AD, RBAC, автоматизация, Telegram. Elasticsearch играет ту же роль, что ваш Meilisearch. |
| Mattermost (+плагины) | Go, React, PostgreSQL | **Отличное.** Slack-альтернатива с тикетами (через плагины/Mattermost ITSM), Wiki, календарь, LDAP, строгий RBAC, PWA, K8s-манифесты, Prometheus-метрики. |
| Chatwoot | Ruby on Rails, Vue.js, Redis | **Хорошее для чатов и тикетов.** Omnichannel inbox, Telegram, PWA, real-time чаты, SLA (в платной/про-версии). Слабее в сложной иерархии ролей и Wiki. |
| Trudesk | Node.js, Express, MongoDB, Socket.IO | **Ближайший по бэкенду.** Тикеты, LDAP, Wiki, кастомные поля, роли. Минус: MongoDB вместо MySQL/Prisma, UI менее современный. |
| Plane | Next.js, Django, PostgreSQL, Tailwind | **Современный UI.** Аналог Jira: тикеты, циклы, модули. SLA и LDAP требуют доработки/enterprise-версии. |

---

## 9. Коммерческие SaaS-аналоги (для бенчмарка)

- **Jira Service Management** — эталон по SLA, автоназначению, LDAP и RBAC.
- **Zendesk / Freshdesk** — эталон по омниканальности (Email, Telegram, чат), глобальному поиску и PWA.
- **Huly / Linear** — эталон по современному UX/UI (быстрые, React, Tailwind, горячие клавиши Ctrl+K), но менее гибкие в кастомизации ролей.

---

## 10. Сильные стороны и риски архитектуры

### ✅ Сильные стороны

- **Гибридный поиск** (Meilisearch → FULLTEXT → LIKE) — отказоустойчивая стратегия
- **Безопасность** — httpOnly cookies, magic bytes + ClamAV, rate-limiting на всех уровнях, инвалидация refresh-токенов
- **Инфраструктура** — PWA, K8s-манифесты, Prometheus/Grafana — высокий уровень зрелости DevOps

### ⚠️ Риски

- **Vite 8 / React 19** — убедиться, что shadcn/ui, @tanstack/react-query, socket.io-client полностью совместимы с React 19 Strict Mode и React Compiler
- **Сложность E2E** — 36 тестов Playwright — хороший старт, но для WebSocket-чатов и SLA-триггеров нужно больше; рассмотреть MSW для мокирования
- **Prisma + MySQL 8.4** — relationMode = "prisma" или правильно настроенные внешние ключи (каскадные удаления для тикетов, сообщений, аудит-логов)

---

## 11. Рекомендация по выбору пути

- **Если нужно «просто чтобы работало» как можно скорее:** разверните Zammad или Mattermost и допишите кастомные плагины для Telegram и специфичных SLA-правил. Экономия 6–12 месяцев разработки.
- **Если это коммерческий продукт, разрабатываемый с нуля:** используйте Refine.dev (или shadcn-admin шаблон) для фронтенда — закроет 70% требований по UI (таблицы, фильтры, дашборды, RBAC-хуки). Бэкенд на Express + Prisma + BullMQ + Socket.IO оставьте кастомным — логика SLA и автоназначения уникальна.

---

## 12. Позиционирование (резюме/презентация)

Напрашивающаяся формулировка:

> **«Самый self-hosted helpdesk с full-stack TypeScript и real-time архитектурой — среди open-source аналогов такой стек отсутствует.»**

Стек системы: **React 19 + TypeScript + Vite 8 + Tailwind v4 + shadcn/ui + Express + Prisma + MySQL 8 + Socket.IO + Redis**