// Rich messages (CHW-08): content_type + rich_payload для сообщений тикета,
// командного чата и виджета. Одни и те же блоки (card/input/select/chips)
// рендерятся в TicketDetail, ChatDetail, WidgetPanel и WidgetInbox, поэтому
// набор колонок одинаковый во всех трёх таблицах.
// Миграция идемпотентна: колонка добавляется только если её нет, флаг — только
// при отсутствии ключа.
const TABLES = ['ticket_messages', 'chat_messages', 'widget_messages']

export async function up(knex) {
  for (const table of TABLES) {
    if (!(await knex.schema.hasTable(table))) continue
    if (!(await knex.schema.hasColumn(table, 'content_type'))) {
      await knex.schema.alterTable(table, (t) => {
        t.string('content_type', 20).notNullable().defaultTo('text')
      })
    }
    if (!(await knex.schema.hasColumn(table, 'rich_payload'))) {
      await knex.schema.alterTable(table, (t) => {
        t.json('rich_payload').nullable()
      })
    }
  }

  if (await knex.schema.hasTable('feature_flags')) {
    const flag = await knex('feature_flags').where({ key: 'rich_messages' }).first()
    if (!flag) {
      await knex('feature_flags').insert({
        key: 'rich_messages',
        enabled: true,
        description: 'Rich messages: карточки, поля, списки и чипы в тикетах, чатах и виджете',
      })
    }
  }
}

export async function down(knex) {
  for (const table of TABLES) {
    if (!(await knex.schema.hasTable(table))) continue
    if (await knex.schema.hasColumn(table, 'rich_payload')) {
      await knex.schema.alterTable(table, (t) => {
        t.dropColumn('rich_payload')
      })
    }
    if (await knex.schema.hasColumn(table, 'content_type')) {
      await knex.schema.alterTable(table, (t) => {
        t.dropColumn('content_type')
      })
    }
  }

  if (await knex.schema.hasTable('feature_flags')) {
    await knex('feature_flags').where({ key: 'rich_messages' }).del()
  }
}
