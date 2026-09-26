// Этап 64 (подфича 3): Merge / Duplicate тикетов — «Объединить с…» (перенос сообщений/вложений),
// колонка merged_into на tickets + флаг «ticket_merge» (дефолт — OFF, правило «фича = флаг»).
// Idempotent: колонка и флаг создаются только если их ещё нет.
export async function up(knex) {
  const t = await knex.schema.hasTable('tickets')
  if (t) {
    const has = await knex.schema.hasColumn('tickets', 'merged_into')
    if (!has) {
      await knex.schema.alterTable('tickets', (table) => {
        table.integer('merged_into').unsigned().nullable()
      })
    }
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'ticket_merge' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'ticket_merge',
        enabled: false,
        description: 'Merge/Duplicate тикетов: «Объединить с…», перенос сообщений/вложений',
      })
    }
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'ticket_merge' }).del()
  const t = await knex.schema.hasTable('tickets')
  if (t) {
    const has = await knex.schema.hasColumn('tickets', 'merged_into')
    if (has) {
      await knex.schema.alterTable('tickets', (table) => {
        table.dropColumn('merged_into')
      })
    }
  }
}