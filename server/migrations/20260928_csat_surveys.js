// Дрейф схемы: модель csat_surveys есть в prisma/schema.prisma и используется
// csat.service.js, но ни одна миграция таблицу не создавала (test-БД собирается
// только из миграций). Создаём идемпотентно, чтобы БД совпадала со схемой.
export async function up(knex) {
  const exists = await knex.schema.hasTable('csat_surveys')
  if (exists) return

  await knex.schema.createTable('csat_surveys', (table) => {
    table.increments('id')
    table.integer('ticket_id').unsigned().notNullable()
    table.string('token', 100).notNullable().unique()
    table.integer('rating').nullable()
    table.text('comment')
    table.string('requester_email', 255).nullable()
    table.timestamp('sent_at').nullable()
    table.timestamp('responded_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.index(['ticket_id'], 'idx_csat_ticket_id')
  })

  // FK как в 20260924_fk_cascades.js — чтобы его повторный накат был no-op.
  await knex.raw(
    `ALTER TABLE \`csat_surveys\` ADD CONSTRAINT \`fk_csat_surveys_ticket_id\`
     FOREIGN KEY (\`ticket_id\`) REFERENCES \`tickets\`(\`id\`) ON DELETE CASCADE`,
  )
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('csat_surveys')
}
