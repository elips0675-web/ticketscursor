export const up = async (knex) => {
  await knex.schema.createTable('chat_read_receipts', (table) => {
    table.increments('id')
    table.integer('chat_id').unsigned().notNullable()
    table.integer('user_id').unsigned().notNullable()
    table.integer('last_read_message_id').unsigned().nullable()
    table.timestamp('last_read_at').defaultTo(knex.fn.now())
    table.unique(['chat_id', 'user_id'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTable('chat_read_receipts')
}