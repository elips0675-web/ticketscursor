// Этап 64 (подфича 2): Связи тикетов (parent/child, blocked_by, duplicate, related) + UI в деталях,
// флаг «ticket_relations» (дефолт — OFF, правило «фича = флаг»).
// Idempotent: таблица и флаг создаются только если их ещё нет.
export async function up(knex) {
  const exists = await knex.schema.hasTable('ticket_relations')
  if (!exists) {
    await knex.schema.createTable('ticket_relations', (table) => {
      table.increments('id')
      table.integer('ticket_id').unsigned().notNullable()
      table.integer('related_ticket_id').unsigned().notNullable()
      table.string('type', 20).notNullable().defaultTo('related')
      table.integer('created_by').unsigned().nullable()
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.unique(['ticket_id', 'related_ticket_id'])
      table.index(['related_ticket_id'])
    })
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'ticket_relations' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'ticket_relations',
        enabled: false,
        description: 'Связи тикетов: parent/child, blocked_by, duplicate, related + UI в деталях',
      })
    }
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'ticket_relations' }).del()
  await knex.schema.dropTableIfExists('ticket_relations')
}