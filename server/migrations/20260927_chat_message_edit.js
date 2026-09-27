// Этап 65 (подзадача 2): редактирование сообщений чата — колонка edited_at на chat_messages,
// флаг «chat_message_edit» (дефолт — OFF, правило «фича = флаг»).
// Idempotent: колонка и флаг создаются только если их ещё нет.
export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('chat_messages', 'edited_at')
  if (!hasColumn) {
    await knex.schema.alterTable('chat_messages', (table) => {
      table.timestamp('edited_at').nullable()
    })
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'chat_message_edit' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'chat_message_edit',
        enabled: false,
        description: 'Редактирование своих сообщений в чатах (edited_at + WS message:edited)',
      })
    }
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'chat_message_edit' }).del()
  const hasColumn = await knex.schema.hasColumn('chat_messages', 'edited_at')
  if (hasColumn) {
    await knex.schema.alterTable('chat_messages', (table) => {
      table.dropColumn('edited_at')
    })
  }
}