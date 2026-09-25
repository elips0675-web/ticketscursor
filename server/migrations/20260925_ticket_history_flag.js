// Этап 62: флаг «История изменений» в карточке тикета (timeline из audit_log + PDF-экспорт).
// Дефолт — OFF (правило «фича = флаг», включение только через админку FeatureFlagsSection).
export async function up(knex) {
  const exists = await knex.schema.hasTable('feature_flags')
  if (!exists) return
  const row = await knex('feature_flags').where({ key: 'ticket_history' }).first()
  if (!row) {
    await knex('feature_flags').insert({
      key: 'ticket_history',
      enabled: false,
      description: 'Вкладка «История изменений» в карточке тикета (timeline из audit_log + PDF)',
    })
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'ticket_history' }).del()
}