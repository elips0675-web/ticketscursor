export const up = async (knex) => {
  await knex.schema.alterTable('ticket_messages', (table) => {
    table.json('mentions').nullable()
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('ticket_messages', (table) => {
    table.dropColumn('mentions')
  })
}