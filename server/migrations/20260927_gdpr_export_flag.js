// Этап 66 (подфича 1): GDPR-экспорт данных пользователя — флаг «gdpr_export» (дефолт — OFF,
// правило «фича = флаг»). Таблицы не нужны: экспорт строится из существующих данных сотрудника.
// Idempotent: флаг вставляется только если его ещё нет.
export async function up(knex) {
  const exists = await knex.schema.hasTable('feature_flags')
  if (!exists) return
  const row = await knex('feature_flags').where({ key: 'gdpr_export' }).first()
  if (!row) {
    await knex('feature_flags').insert({
      key: 'gdpr_export',
      enabled: false,
      description: 'GDPR-экспорт: скачивание всех данных пользователя в JSON (кнопка в Профиле)',
    })
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'gdpr_export' }).del()
}