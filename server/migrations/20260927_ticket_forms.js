// Этап 66 (подфича 3): Ticket forms — категории тикетов с JSON-схемой полей.
// Таблица ticket_categories (name, description, schema JSON, enabled, sort_order)
// + колонка tickets.form_data (значения полей формы при создании тикета)
// + флаг «ticket_forms» (дефолт — OFF, правило «фича = флаг»).
// Idempotent: таблица/колонка/флаг создаются только если их ещё нет.
export async function up(knex) {
  const exists = await knex.schema.hasTable('ticket_categories')
  if (!exists) {
    await knex.schema.createTable('ticket_categories', (table) => {
      table.increments('id')
      table.string('name', 100).notNullable().unique()
      table.string('description', 500).defaultTo('')
      table.json('schema')
      table.boolean('enabled').defaultTo(true)
      table.integer('sort_order').defaultTo(0)
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
  // Колонка tickets.form_data (JSON) — значения динамических полей формы.
  const cols = await knex('information_schema.columns')
    .where({
      table_schema: knex.client.config.connection.database,
      table_name: 'tickets',
      column_name: 'form_data',
    })
    .select('column_name as cn')
  if (cols.length === 0) {
    await knex.schema.alterTable('tickets', (table) => {
      table.json('form_data')
    })
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'ticket_forms' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'ticket_forms',
        enabled: false,
        description: 'Формы тикетов: категории с JSON-схемой полей (создание тикета по шаблону)',
      })
    }
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'ticket_forms' }).del()
  await knex.schema.alterTable('tickets', (table) => {
    table.dropColumn('form_data')
  })
  await knex.schema.dropTableIfExists('ticket_categories')
}