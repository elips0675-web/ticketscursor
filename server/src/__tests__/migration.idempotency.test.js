import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import knexLib from 'knex'
import knexConfig from '../../knexfile.js'
import { up as fkCascadesUp } from '../../migrations/20260924_fk_cascades.js'
import { up as scheduledReportsUp } from '../../migrations/20260927_scheduled_reports.js'

// Migration idempotency (Этап 60): повторный накат не должен ронять деплой
// и не должен дублировать объекты (FK). Прогон идёт по тестовой БД
// (уже мигрирована vitest.global-setup.js).

let knex

beforeAll(() => {
  knex = knexLib(knexConfig)
})

afterAll(async () => {
  await knex.destroy()
})

describe('Migration idempotency — повторный накат безопасен', () => {
  it('knex migrate:latest второй раз ничего не применяет', async () => {
    const [, log1] = await knex.migrate.latest()
    expect(Array.isArray(log1)).toBe(true)
    // второй накат: новых миграций быть не должно
    const [, log2] = await knex.migrate.latest()
    expect(log2.length).toBe(0)
  })

  it('fk_cascades up() повторно — не падает и не плодит дубли FK', async () => {
    const countFks = async () => {
      const [rows] = await knex.raw(
        `SELECT COUNT(*) AS c FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`,
      )
      return Number(rows[0].c)
    }

    const before = await countFks()
    await fkCascadesUp(knex) // уже применена global-setup'ом — повторно должна быть no-op
    const after = await countFks()
    expect(after).toBe(before)
  })

  it('scheduled_reports up() повторно — таблица и флаг не дублируются', async () => {
    expect(await knex.schema.hasTable('scheduled_reports')).toBe(true)

    await scheduledReportsUp(knex)

    const rows = await knex('feature_flags').where({ key: 'scheduled_reports' }).count({ c: '*' })
    expect(Number(rows[0].c)).toBe(1)
    expect(await knex.schema.hasTable('scheduled_reports')).toBe(true)
  })
})