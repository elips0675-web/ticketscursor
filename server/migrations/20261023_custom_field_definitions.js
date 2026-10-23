// CON-02: custom_field_definitions и custom_field_values существовали только в
// standalone-скрипте server/migrate-custom-fields.mjs и в тест-харнессе
// test-db-setup.js (там с чужой колонкой field_type и без UNIQUE-ключа), поэтому
// на свежей БД из миграций таблиц не было и GET /api/admin/custom-fields,
// GET /api/tickets/custom-fields падали 500. Схема приведена к prisma
// (server/prisma/schema.prisma:107-134). Миграция идемпотентна: на базе, где
// таблицы уже созданы старым скриптом, она только снимает расхождения
// (field_type → type, недостающая category, отсутствующий UNIQUE-ключ).
export async function up(knex) {
  const dbName = knex.client.config.connection.database

  const hasColumn = async (table, column) => {
    const rows = await knex('information_schema.columns')
      .where({ table_schema: dbName, table_name: table, column_name: column })
      .select('column_name as cn')
    return rows.length > 0
  }

  const hasIndex = async (table, indexName) => {
    const rows = await knex('information_schema.statistics')
      .where({ table_schema: dbName, table_name: table, index_name: indexName })
      .select('index_name as ix')
    return rows.length > 0
  }

  if (!(await knex.schema.hasTable('custom_field_definitions'))) {
    await knex.schema.createTable('custom_field_definitions', (table) => {
      table.increments('id')
      table.string('name', 255).notNullable()
      table.string('type', 20).notNullable()
      table.json('options').nullable()
      table.boolean('required').defaultTo(false)
      table.string('category', 50).defaultTo('general')
      table.integer('sort_order').defaultTo(0)
      table.boolean('enabled').defaultTo(true)
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  } else {
    if ((await hasColumn('custom_field_definitions', 'field_type')) && !(await hasColumn('custom_field_definitions', 'type'))) {
      await knex.raw(
        'ALTER TABLE `custom_field_definitions` CHANGE COLUMN `field_type` `type` VARCHAR(20) NOT NULL',
      )
    }
    if (!(await hasColumn('custom_field_definitions', 'category'))) {
      await knex.raw(
        "ALTER TABLE `custom_field_definitions` ADD COLUMN `category` VARCHAR(50) DEFAULT 'general'",
      )
    }
  }

  if (!(await knex.schema.hasTable('custom_field_values'))) {
    await knex.schema.createTable('custom_field_values', (table) => {
      table.increments('id')
      table.integer('field_id').unsigned().notNullable()
      table.integer('ticket_id').unsigned().notNullable()
      table.text('value')
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
      table.unique(['field_id', 'ticket_id'], { indexName: 'uq_cf_field_ticket' })
      table.index(['ticket_id'], 'idx_cf_ticket')
    })
    await knex.raw(
      'ALTER TABLE `custom_field_values` ADD CONSTRAINT `fk_custom_field_values_field` ' +
        'FOREIGN KEY (`field_id`) REFERENCES `custom_field_definitions`(`id`) ON DELETE CASCADE',
    )
    await knex.raw(
      'ALTER TABLE `custom_field_values` ADD CONSTRAINT `fk_custom_field_values_ticket` ' +
        'FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE',
    )
  } else if (!(await hasIndex('custom_field_values', 'uq_cf_field_ticket'))) {
    await knex.raw(
      'ALTER TABLE `custom_field_values` ADD UNIQUE KEY `uq_cf_field_ticket` (`field_id`, `ticket_id`)',
    )
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('custom_field_values')
  await knex.schema.dropTableIfExists('custom_field_definitions')
}
