// Виджет чата «Chat with us» (CHW-06): отдельные таблицы, потому что
// chat_messages.sender_id обязателен и ссылается на employees — посетитель сайта
// не сотрудник, и заводить ему учётку (как это делает telegram.js с role='agent')
// значит снова смешивать заявителя с персоналом.
// Миграция идемпотентна: таблицы/индексы создаются только если их нет,
// дефолтный канал и флаг появляются только при пустой таблице/отсутствии ключа.
import crypto from 'node:crypto'

export async function up(knex) {
  if (!(await knex.schema.hasTable('widget_channels'))) {
    await knex.schema.createTable('widget_channels', (table) => {
      table.increments('id')
      table.string('name', 120).notNullable()
      table.string('website_token', 64).notNullable().unique()
      table.text('allowed_origins').nullable()
      table.text('welcome_message').nullable()
      table.text('offline_message').nullable()
      table.string('color', 20).defaultTo('#1f93ff')
      table.boolean('enabled').notNullable().defaultTo(true)
      table.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }

  if (!(await knex.schema.hasTable('widget_conversations'))) {
    await knex.schema.createTable('widget_conversations', (table) => {
      table.increments('id')
      table.integer('channel_id').unsigned().notNullable()
      table.string('visitor_id', 64).notNullable()
      table.string('visitor_token', 64).notNullable().unique()
      table.string('visitor_name', 255).notNullable()
      table.string('visitor_email', 255).nullable()
      table.string('status', 20).notNullable().defaultTo('open')
      table.integer('unread_for_agent').notNullable().defaultTo(0)
      table.timestamp('last_message_at').notNullable().defaultTo(knex.fn.now())
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
      table.index(['channel_id', 'status', 'last_message_at'], 'idx_widget_conv_inbox')
      table.index(['visitor_id'], 'idx_widget_conv_visitor')
    })
    await knex.raw(
      'ALTER TABLE `widget_conversations` ADD CONSTRAINT `fk_widget_conv_channel` ' +
        'FOREIGN KEY (`channel_id`) REFERENCES `widget_channels`(`id`) ON DELETE CASCADE',
    )
  }

  if (!(await knex.schema.hasTable('widget_messages'))) {
    await knex.schema.createTable('widget_messages', (table) => {
      table.increments('id')
      table.integer('conversation_id').unsigned().notNullable()
      table.string('sender_type', 20).notNullable()
      table.string('sender_name', 255).notNullable()
      table.integer('employee_id').unsigned().nullable()
      table.text('text').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
      table.index(['conversation_id', 'created_at'], 'idx_widget_msg_thread')
    })
    await knex.raw(
      'ALTER TABLE `widget_messages` ADD CONSTRAINT `fk_widget_msg_conversation` ' +
        'FOREIGN KEY (`conversation_id`) REFERENCES `widget_conversations`(`id`) ON DELETE CASCADE',
    )
    await knex.raw(
      'ALTER TABLE `widget_messages` ADD CONSTRAINT `fk_widget_msg_employee` ' +
        'FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL',
    )
  }

  const channels = await knex('widget_channels').select('id').limit(1)
  if (channels.length === 0) {
    await knex('widget_channels').insert({
      name: 'Сайт',
      website_token: crypto.randomBytes(16).toString('hex'),
      allowed_origins: '',
      welcome_message: 'Здравствуйте! Напишите нам — ответим в рабочее время.',
      offline_message: 'Сейчас мы офлайн. Оставьте сообщение — ответим, когда вернёмся.',
      color: '#1f93ff',
      enabled: true,
    })
  }

  if (await knex.schema.hasTable('feature_flags')) {
    const flag = await knex('feature_flags').where({ key: 'chat_widget' }).first()
    if (!flag) {
      await knex('feature_flags').insert({
        key: 'chat_widget',
        enabled: true,
        description: 'Виджет чата «Chat with us» на /portal и внешних сайтах',
      })
    }
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('widget_messages')
  await knex.schema.dropTableIfExists('widget_conversations')
  await knex.schema.dropTableIfExists('widget_channels')
  if (await knex.schema.hasTable('feature_flags')) {
    await knex('feature_flags').where({ key: 'chat_widget' }).del()
  }
}
