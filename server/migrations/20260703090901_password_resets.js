export function up(knex) {
  return knex.schema.createTable('password_resets', (table) => {
    table.string('email').primary()
    table.string('token').notNullable().index()
    table.timestamp('expires_at').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
  })
}

export function down(knex) {
  return knex.schema.dropTable('password_resets')
}
