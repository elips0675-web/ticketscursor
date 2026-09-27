// Этап 65 (подзадача 3): reply-to / threads в чате — колонка reply_to_message_id на chat_messages,
// флаг «chat_reply_to» (дефолт — OFF, правило «фича = флаг»).
// Idempotent: колонка и флаг создаются только если их ещё нет.
export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('chat_messages', 'reply_to_message_id')
  if (!hasColumn) {
    await knex.schema.alterTable('chat_messages', (table) => {
      table.integer('reply_to_message_id').unsigned().nullable()
    })
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'chat_reply_to' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'chat_reply_to',
        enabled: false,
        description: 'Reply-to / threads в чате (reply_to_message_id, цитирование)',
      })
    }
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'chat_reply_to' }).del()
  const hasColumn = await knex.schema.hasColumn('chat_messages', 'reply_to_message_id')
  if (hasColumn) {
    await knex.schema.alterTable('chat_messages', (table) => {
      table.dropColumn('reply_to_message_id')
    })
  }
}