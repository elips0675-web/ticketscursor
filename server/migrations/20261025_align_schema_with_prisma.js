// Выравнивание схемы миграций с server/prisma/schema.prisma.
//
// Prisma Client строит запросы по schema.prisma, а колонки создаёт knex. Пока
// эти два источника расходятся, моки тестов зелёные, а живая БД отвечает 500:
//   - tickets.status/priority/category и chat_rooms.type создавались как ENUM,
//     хотя Prisma объявляет String; код пишет 'reopened' (кнопка «Переоткрыть»)
//     и произвольную категорию — MySQL отвечал WARN_DATA_TRUNCATED;
//   - employees.role оставался VARCHAR(10), а роль super_admin — 11 символов;
//   - notifications.title/link и password_resets.token были VARCHAR(255) при
//     @db.VarChar(500) в Prisma;
//   - tickets.email_message_id использовался в email-ingestion.service.js, но
//     не был объявлен ни в Prisma, ни в миграциях (колонку добавлял только
//     тест-харнесс), поэтому Prisma отклонял запрос до обращения к БД.
//
// Миграция идемпотентна: тип читается из information_schema, ALTER выполняется
// только если колонка действительно уже, чем объявлено в Prisma.
export async function up(knex) {
  const dbName = knex.client.config.connection.database

  const readColumn = async (table, name) => {
    const rows = await knex('information_schema.columns')
      .where({ table_schema: dbName, table_name: table, column_name: name })
      .select('data_type as dataType', 'column_type as columnType')
    return rows[0] || null
  }

  const modify = (table, name, definition) =>
    knex.raw(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${name}\` ${definition}`)

  const varcharLength = (columnType) => {
    const match = /\((\d+)\)/.exec(columnType || '')
    return match ? Number(match[1]) : 0
  }

  const widenVarchar = async (table, name, target, definition) => {
    const column = await readColumn(table, name)
    if (!column) return
    if (column.dataType === 'varchar' && varcharLength(column.columnType) >= target) return
    await modify(table, name, definition)
  }

  const dropEnum = async (table, name, definition) => {
    const column = await readColumn(table, name)
    if (!column || column.dataType !== 'enum') return
    await modify(table, name, definition)
  }

  await dropEnum('tickets', 'status', "VARCHAR(20) NOT NULL DEFAULT 'open'")
  await dropEnum('tickets', 'priority', "VARCHAR(20) NOT NULL DEFAULT 'medium'")
  await dropEnum('tickets', 'category', "VARCHAR(50) NOT NULL DEFAULT 'support'")
  await dropEnum('chat_rooms', 'type', "VARCHAR(20) NOT NULL DEFAULT 'group'")

  await widenVarchar('employees', 'role', 20, "VARCHAR(20) NOT NULL DEFAULT 'agent'")
  await widenVarchar('notifications', 'title', 500, 'VARCHAR(500) NOT NULL')
  await widenVarchar('notifications', 'link', 500, 'VARCHAR(500) NULL')
  await widenVarchar('password_resets', 'token', 500, 'VARCHAR(500) NOT NULL')

  const hasEmailMessageId = await readColumn('tickets', 'email_message_id')
  if (!hasEmailMessageId) {
    await knex.raw('ALTER TABLE `tickets` ADD COLUMN `email_message_id` VARCHAR(500) NULL')
  }

  const hasEmailIndex = await knex('information_schema.statistics')
    .where({ table_schema: dbName, table_name: 'tickets', index_name: 'idx_tickets_email_message_id' })
    .select('index_name as indexName')
  if (hasEmailIndex.length === 0) {
    await knex.raw('ALTER TABLE `tickets` ADD INDEX `idx_tickets_email_message_id` (`email_message_id`)')
  }
}

// Обратный путь возвращает только добавленную колонку. Сужение VARCHAR обратно
// до ENUM невозможно без потери данных: в status уже могут лежать reopened и
// waiting_for_customer, в category — пользовательские категории.
export async function down(knex) {
  const dbName = knex.client.config.connection.database
  const rows = await knex('information_schema.columns')
    .where({ table_schema: dbName, table_name: 'tickets', column_name: 'email_message_id' })
    .select('column_name as columnName')
  if (rows.length > 0) {
    await knex.raw('ALTER TABLE `tickets` DROP INDEX `idx_tickets_email_message_id`')
    await knex.raw('ALTER TABLE `tickets` DROP COLUMN `email_message_id`')
  }
}
