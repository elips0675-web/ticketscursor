// CHW-01: Telegram webhook + дедупликация update_id.
// Бот умел только polling, поэтому Telegram не мог доставлять сообщения при
// перезапуске, а повторная доставка одного update_id создавала дубли. Таблица
// хранит обработанные update_id (UNIQUE), флаг telegram_two_way — kill switch
// для ответа оператора в Telegram. Миграция идемпотентна.
export async function up(knex) {
  if (!(await knex.schema.hasTable('telegram_updates'))) {
    await knex.schema.createTable('telegram_updates', (table) => {
      table.increments('id')
      table.bigInteger('update_id').notNullable().unique()
      table.string('kind', 32).nullable()
      table.timestamp('processed_at').notNullable().defaultTo(knex.fn.now())
    })
  }

  if (await knex.schema.hasTable('feature_flags')) {
    const flag = await knex('feature_flags').where({ key: 'telegram_two_way' }).first()
    if (!flag) {
      await knex('feature_flags').insert({
        key: 'telegram_two_way',
        enabled: false,
        description: 'Telegram: ответ оператора уходит заявителю (CHW-01)',
      })
    }
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('telegram_updates')
  if (await knex.schema.hasTable('feature_flags')) {
    await knex('feature_flags').where({ key: 'telegram_two_way' }).del()
  }
}
