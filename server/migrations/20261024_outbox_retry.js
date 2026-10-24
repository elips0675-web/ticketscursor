// CHW-04: outbox retry с backoff вместо вечного повтора каждые 100 мс.
// До миграции event_outbox знал только sent_at: упавшее событие повторялось
// бесконечно и без паузы, а причина ошибки нигде не сохранялась. Добавляем
// attempts/last_error/next_attempt_at/status, индекс под выборку готовых к
// отправке и флаг outbox_retry (kill switch: off = прежнее поведение).
// Миграция идемпотентна: колонки, индекс и флаг создаются при отсутствии,
// статус старых строк бэкфиллится только из sent_at.
export async function up(knex) {
  if (!(await knex.schema.hasTable('event_outbox'))) return

  if (!(await knex.schema.hasColumn('event_outbox', 'attempts'))) {
    await knex.schema.alterTable('event_outbox', (table) => {
      table.integer('attempts').notNullable().defaultTo(0)
    })
  }
  if (!(await knex.schema.hasColumn('event_outbox', 'last_error'))) {
    await knex.schema.alterTable('event_outbox', (table) => {
      table.text('last_error').nullable()
    })
  }
  if (!(await knex.schema.hasColumn('event_outbox', 'next_attempt_at'))) {
    await knex.schema.alterTable('event_outbox', (table) => {
      table.timestamp('next_attempt_at').nullable()
    })
  }
  if (!(await knex.schema.hasColumn('event_outbox', 'status'))) {
    await knex.schema.alterTable('event_outbox', (table) => {
      table.string('status', 16).notNullable().defaultTo('pending')
    })
  }

  await knex('event_outbox')
    .whereNotNull('sent_at')
    .where('status', 'pending')
    .update({ status: 'sent' })

  const [indexRows] = await knex.raw(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_outbox'
       AND INDEX_NAME = 'idx_event_outbox_status_next'`,
  )
  if (Number(indexRows[0].c) === 0) {
    await knex.schema.alterTable('event_outbox', (table) => {
      table.index(['status', 'next_attempt_at'], 'idx_event_outbox_status_next')
    })
  }

  if (await knex.schema.hasTable('feature_flags')) {
    const flag = await knex('feature_flags').where({ key: 'outbox_retry' }).first()
    if (!flag) {
      await knex('feature_flags').insert({
        key: 'outbox_retry',
        enabled: true,
        description: 'Outbox: retry с backoff 1м/5м/15м и статусом failed (CHW-04)',
      })
    }
  }
}

export async function down(knex) {
  if (!(await knex.schema.hasTable('event_outbox'))) return

  const [indexRows] = await knex.raw(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_outbox'
       AND INDEX_NAME = 'idx_event_outbox_status_next'`,
  )
  if (Number(indexRows[0].c) > 0) {
    await knex.schema.alterTable('event_outbox', (table) => {
      table.dropIndex(['status', 'next_attempt_at'], 'idx_event_outbox_status_next')
    })
  }

  for (const column of ['status', 'next_attempt_at', 'last_error', 'attempts']) {
    if (await knex.schema.hasColumn('event_outbox', column)) {
      await knex.schema.alterTable('event_outbox', (table) => {
        table.dropColumn(column)
      })
    }
  }

  if (await knex.schema.hasTable('feature_flags')) {
    await knex('feature_flags').where({ key: 'outbox_retry' }).del()
  }
}
