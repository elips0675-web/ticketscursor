// Этап 64 (подфича 1): Watchers/Subscribers тикета — наблюдатели получают уведомления об изменениях,
// флаг «ticket_watchers» (дефолт — OFF, правило «фича = флаг»).
// Idempotent: таблица и флаг создаются только если их ещё нет.
export async function up(knex) {
  const exists = await knex.schema.hasTable('ticket_watchers')
  if (!exists) {
    await knex.schema.createTable('ticket_watchers', (table) => {
      table.increments('id')
      table.integer('ticket_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.unique(['ticket_id', 'employee_id'])
      table.index(['employee_id'])
    })
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'ticket_watchers' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'ticket_watchers',
        enabled: false,
        description: 'Watchers/Subscribers тикета: подписка на уведомления об изменениях',
      })
    }
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'ticket_watchers' }).del()
  await knex.schema.dropTableIfExists('ticket_watchers')
}