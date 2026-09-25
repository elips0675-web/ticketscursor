// Этап 63 (подфича 3): настройки уведомлений per user — каналы (email/push/in_app) × события тикетов,
// флаг «notification_prefs» (дефолт — OFF, правило «фича = флаг»).
// Idempotent: таблица и флаг создаются только если их ещё нет.
export async function up(knex) {
  const exists = await knex.schema.hasTable('notification_preferences')
  if (!exists) {
    await knex.schema.createTable('notification_preferences', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().unique()
      table.text('prefs')
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'notification_prefs' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'notification_prefs',
        enabled: false,
        description: 'Настройки уведомлений пользователя: каналы (email/push/in-app) по событиям',
      })
    }
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'notification_prefs' }).del()
  await knex.schema.dropTableIfExists('notification_preferences')
}