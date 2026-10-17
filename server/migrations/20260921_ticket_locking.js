// Дрейф схемы: 20260921_ticket_locking.sql не применялся (knex берёт только
// *.js), поэтому колонки и индекс локирования тикета существовали лишь в
// тестовой БД (их добавлял test-db-setup.js:55-57). На свежем проде
// collision.service.js падал на tickets.locked_by / locked_at. Тот же SQL с
// двумя правками: locked_by INT UNSIGNED (employees.id = UNSIGNED, иначе
// ER_FK_INCOMPATIBLE_COLUMNS — исходный SQL не выполнялся никогда) и
// идемпотентная проверка колонки/индекса/FK перед ALTER.
async function hasIndex(knex, table, indexName) {
  const [rows] = await knex.raw(
    'SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [table, indexName],
  )
  return Number(rows[0].cnt) > 0
}

async function hasForeignKey(knex, table, constraintName) {
  const [rows] = await knex.raw(
    'SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
    [table, constraintName],
  )
  return Number(rows[0].cnt) > 0
}

export async function up(knex) {
  if (!(await knex.schema.hasColumn('tickets', 'locked_by'))) {
    await knex.raw('ALTER TABLE `tickets` ADD COLUMN `locked_by` INT UNSIGNED NULL')
  }
  if (!(await knex.schema.hasColumn('tickets', 'locked_at'))) {
    await knex.raw('ALTER TABLE `tickets` ADD COLUMN `locked_at` DATETIME NULL')
  }
  if (!(await hasIndex(knex, 'tickets', 'idx_tickets_locked_by'))) {
    await knex.raw('ALTER TABLE `tickets` ADD INDEX `idx_tickets_locked_by` (`locked_by`)')
  }
  if (!(await hasForeignKey(knex, 'tickets', 'fk_tickets_locked_by'))) {
    await knex.raw(
      'ALTER TABLE `tickets` ADD CONSTRAINT `fk_tickets_locked_by` FOREIGN KEY (`locked_by`) REFERENCES `employees`(`id`) ON DELETE SET NULL',
    )
  }
}

export async function down(knex) {
  if (await hasForeignKey(knex, 'tickets', 'fk_tickets_locked_by')) {
    await knex.raw('ALTER TABLE `tickets` DROP FOREIGN KEY `fk_tickets_locked_by`')
  }
  if (await hasIndex(knex, 'tickets', 'idx_tickets_locked_by')) {
    await knex.raw('ALTER TABLE `tickets` DROP INDEX `idx_tickets_locked_by`')
  }
  if (await knex.schema.hasColumn('tickets', 'locked_at')) {
    await knex.raw('ALTER TABLE `tickets` DROP COLUMN `locked_at`')
  }
  if (await knex.schema.hasColumn('tickets', 'locked_by')) {
    await knex.raw('ALTER TABLE `tickets` DROP COLUMN `locked_by`')
  }
}
