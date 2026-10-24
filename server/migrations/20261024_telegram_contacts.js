// CHW-02: Telegram-пользователь — заявитель, а не агент.
// До этой миграции linkTelegramUser создавал employees с role='agent', и внешний
// человек попадал в /employees. Теперь связь telegram_id → employee_id живёт в
// отдельной таблице, а сотрудник с role='requester' создаётся только при первом
// тикете. Миграция идемпотентна: таблица/флаг создаются при отсутствии, бэкфилл
// не дублирует контакты и не трогает уже понижённые роли.
export async function up(knex) {
  if (!(await knex.schema.hasTable('telegram_contacts'))) {
    await knex.schema.createTable('telegram_contacts', (table) => {
      table.increments('id')
      table.bigInteger('telegram_id').notNullable().unique()
      table.bigInteger('chat_id').nullable()
      table.string('username', 255).nullable()
      table.string('name', 255).nullable()
      table.integer('employee_id').unsigned().nullable()
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())
      table.index(['employee_id'], 'idx_telegram_contacts_employee')
    })
    await knex.raw(
      'ALTER TABLE `telegram_contacts` ADD CONSTRAINT `fk_telegram_contacts_employee` ' +
        'FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL',
    )
  }

  const legacy = await knex('employees')
    .where('email', 'like', '%@telegram.bot')
    .select('id', 'email', 'name', 'role')

  for (const row of legacy) {
    const telegramId = String(row.email).split('@')[0]
    if (!/^\d+$/.test(telegramId)) continue

    if (row.role !== 'requester') {
      await knex('employees').where({ id: row.id }).update({ role: 'requester' })
    }

    const contact = await knex('telegram_contacts').where({ telegram_id: telegramId }).first()
    if (!contact) {
      await knex('telegram_contacts').insert({
        telegram_id: telegramId,
        name: row.name || 'Telegram User',
        employee_id: row.id,
      })
    } else if (!contact.employee_id) {
      await knex('telegram_contacts').where({ id: contact.id }).update({ employee_id: row.id })
    }
  }

  if (await knex.schema.hasTable('feature_flags')) {
    const flag = await knex('feature_flags').where({ key: 'telegram_contacts' }).first()
    if (!flag) {
      await knex('feature_flags').insert({
        key: 'telegram_contacts',
        enabled: true,
        description: 'Контакты Telegram: заявитель не становится агентом (CHW-02)',
      })
    }
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('telegram_contacts')
  if (await knex.schema.hasTable('feature_flags')) {
    await knex('feature_flags').where({ key: 'telegram_contacts' }).del()
  }
}
