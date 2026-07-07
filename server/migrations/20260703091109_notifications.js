export function up(knex) {
  return knex.schema.createTable('notifications', (table) => {
    table.increments('id').primary()
    table.integer('user_id').unsigned().references('id').inTable('employees').notNullable()
    table.string('type').notNullable()
    table.string('title').notNullable()
    table.text('body')
    table.string('link')
    table.boolean('is_read').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.index(['user_id', 'is_read'])
  })
}

export function down(knex) {
  return knex.schema.dropTable('notifications')
}
