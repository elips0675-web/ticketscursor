exports.up = function(knex) {
  return knex.schema.createTable('audit_log', (table) => {
    table.increments('id').primary()
    table.integer('user_id').unsigned().references('id').inTable('employees')
    table.string('user_name')
    table.string('action')
    table.string('entity_type')
    table.integer('entity_id').unsigned()
    table.text('details')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.index(['entity_type', 'entity_id'])
    table.index('created_at')
  })
}

exports.down = function(knex) {
  return knex.schema.dropTable('audit_log')
}
