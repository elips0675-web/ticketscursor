export const up = async (knex) => {
  await knex.schema.alterTable('tickets', (table) => {
    table.json('tags').nullable()
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('tickets', (table) => {
    table.dropColumn('tags')
  })
}