import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import knexLib from 'knex'
import knexConfig from '../../knexfile.js'
import { up as fkCascadesUp } from '../../migrations/20260924_fk_cascades.js'
import { up as scheduledReportsUp } from '../../migrations/20260927_scheduled_reports.js'
import { up as telegramContactsUp } from '../../migrations/20261024_telegram_contacts.js'

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

  it('telegram_contacts up() повторно — контакт и флаг не дублируются, роль понижается', async () => {
    expect(await knex.schema.hasTable('telegram_contacts')).toBe(true)
    const email = '987654321@telegram.bot'
    const telegramId = '987654321'
    await knex('telegram_contacts').where({ telegram_id: telegramId }).del()
    await knex('employees').where({ email }).del()

    const [employeeId] = await knex('employees').insert({
      name: 'Legacy Telegram',
      email,
      password_hash: 'telegram-oauth',
      role: 'agent',
      department: 'Telegram',
      is_active: true,
    })

    await telegramContactsUp(knex)
    await telegramContactsUp(knex)

    const employee = await knex('employees').where({ id: employeeId }).first()
    expect(employee.role).toBe('requester')

    const contacts = await knex('telegram_contacts').where({ telegram_id: telegramId })
    expect(contacts).toHaveLength(1)
    expect(contacts[0].employee_id).toBe(employeeId)

    const flags = await knex('feature_flags').where({ key: 'telegram_contacts' }).count({ c: '*' })
    expect(Number(flags[0].c)).toBe(1)

    await knex('telegram_contacts').where({ telegram_id: telegramId }).del()
    await knex('employees').where({ id: employeeId }).del()
  })
})