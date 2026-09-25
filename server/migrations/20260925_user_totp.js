// Этап 63 (подфича 1): таблица 2FA/TOTP (otplib) — секрет + включение для admin/super_admin.
// Idempotent: создаёт таблицу только если её ещё нет.
export async function up(knex) {
  const exists = await knex.schema.hasTable('user_totp')
  if (!exists) {
    await knex.schema.createTable('user_totp', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().unique()
      table.string('secret', 200).notNullable()
      table.boolean('enabled').notNullable().defaultTo(false)
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('user_totp')
}