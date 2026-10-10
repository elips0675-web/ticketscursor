// P1 №11 (Что-доделать.txt): подготовка тестовой БД для E2E-джобы в CI.
// Использует общий модуль server/test-db-setup.js — ту же подготовку, что и
// vitest.global-setup.js (migrate + фиксы колонок + seed), чтобы E2E-спеки
// (search.spec.ts ждёт seed-тикет, SLA/lock-роуты требуют колонки после фиксов)
// видели ту же БД, что серверные тесты.
import { prepareTestDatabase } from '../server/test-db-setup.js'

const { dbName } = await prepareTestDatabase()
console.log(`E2E test DB ready: ${dbName}`)