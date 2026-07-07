export function up(knex) {
  return knex.schema.createTable('admin_settings', (table) => {
    table.string('key').primary()
    table.text('value')
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })
}

export function down(knex) {
  return knex.schema.dropTable('admin_settings')
}
