export function up(knex) {
  return knex.schema
    .createTable('refresh_tokens', (t) => {
      t.increments('id')
      t.integer('user_id').unsigned().notNullable()
      t.string('token', 500).notNullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.timestamp('expires_at').notNullable()
      t.foreign('user_id').references('employees.id').onDelete('CASCADE')
    })
    .then(() => {
      return knex.schema.alterTable('employees', (t) => {
        t.enu('role', ['agent', 'senior_agent', 'admin', 'super_admin']).alter()
      })
    })
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('refresh_tokens')
}
