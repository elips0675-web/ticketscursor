// Этап 63 (подфича 1): флаг «2FA/TOTP» — двухфакторная аутентификация для admin/super_admin.
// Дефолт — OFF (правило «фича = флаг», включение только через админку FeatureFlagsSection).
export async function up(knex) {
  const exists = await knex.schema.hasTable('feature_flags')
  if (!exists) return
  const row = await knex('feature_flags').where({ key: 'two_fa' }).first()
  if (!row) {
    await knex('feature_flags').insert({
      key: 'two_fa',
      enabled: false,
      description: '2FA/TOTP (otplib): двухшаговый вход + QR-код в Profile для admin/super_admin',
    })
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'two_fa' }).del()
}