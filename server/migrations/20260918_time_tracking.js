export const up = async (knex) => {
  await knex.schema.createTable('time_entries', (t) => {
    t.increments('id')
    t.integer('ticket_id').unsigned().notNullable()
    t.integer('user_id').unsigned().notNullable()
    t.integer('minutes').notNullable()
    t.string('description', 500).defaultTo('')
    t.date('entry_date').notNullable()
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.index(['ticket_id', 'user_id'])
    t.foreign('ticket_id').references('tickets.id').onDelete('CASCADE')
    t.foreign('user_id').references('employees.id').onDelete('CASCADE')
  })

  await knex.schema.createTable('ticket_timers', (t) => {
    t.increments('id')
    t.integer('ticket_id').unsigned().notNullable()
    t.integer('user_id').unsigned().notNullable()
    t.timestamp('started_at').notNullable()
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.unique(['ticket_id', 'user_id'])
    t.foreign('ticket_id').references('tickets.id').onDelete('CASCADE')
    t.foreign('user_id').references('employees.id').onDelete('CASCADE')
  })
}

export const down = async (knex) => {
  await knex.schema.dropTable('ticket_timers')
  await knex.schema.dropTable('time_entries')
}