// Этап 63 (подфича 2): активные сессии пользователя — device/ip/UA + last_seen_at в refresh_tokens,
// флаг «user_sessions» (дефолт — OFF, правило «фича = флаг»).
// Idempotent: колонки добавляются только если их ещё нет.
export async function up(knex) {
  const t = await knex.schema.hasTable('refresh_tokens')
  if (t) {
    const cols = [
      { name: 'device_name', type: 'string100' },
      { name: 'ip_address', type: 'string45' },
      { name: 'user_agent', type: 'string500' },
      { name: 'last_seen_at', type: 'timestamp' },
    ]
    for (const col of cols) {
      const has = await knex.schema.hasColumn('refresh_tokens', col.name)
      if (!has) {
        await knex.schema.alterTable('refresh_tokens', (table) => {
          if (col.type === 'timestamp') table.timestamp(col.name)
          else if (col.type === 'string100') table.string(col.name, 100)
          else if (col.type === 'string45') table.string(col.name, 45)
          else table.string(col.name, 500)
        })
      }
    }
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'user_sessions' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'user_sessions',
        enabled: false,
        description: 'Активные сессии пользователя: список устройств (device/ip/UA) + отзыв в Profile',
      })
    }
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'user_sessions' }).del()
  const t = await knex.schema.hasTable('refresh_tokens')
  if (!t) return
  await knex.schema.alterTable('refresh_tokens', (table) => {
    table.dropColumn('device_name')
    table.dropColumn('ip_address')
    table.dropColumn('user_agent')
    table.dropColumn('last_seen_at')
  })
}