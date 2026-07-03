exports.up = function(knex) {
  return knex.schema.createTable('admin_settings', (table) => {
    table.string('key').primary()
    table.text('value')
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })
}

exports.down = function(knex) {
  return knex.schema.dropTable('admin_settings')
}
