// Дрейф схемы: 20260921_ticket_recurrences.sql не применялся (knex берёт только
// *.js), ни seed.sql таблицу тоже не создаёт. На свежем проде
// recurrence.service.js падал на отсутствующей ticket_recurrences. FK-колонки
// INT UNSIGNED — как employees.id (иначе ER_FK_INCOMPATIBLE_COLUMNS, см.
// 20260919/20260921_migrations: исходный SQL не выполнялся никогда). Идемпотентно.
export async function up(knex) {
  if (await knex.schema.hasTable('ticket_recurrences')) return

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS \`ticket_recurrences\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      priority VARCHAR(20) DEFAULT 'medium',
      category VARCHAR(50),
      assigned_to INT UNSIGNED,
      cron_expr VARCHAR(100) NOT NULL,
      next_run DATETIME,
      is_active BOOLEAN DEFAULT TRUE,
      last_run DATETIME,
      created_by INT UNSIGNED,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (assigned_to) REFERENCES \`employees\`(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES \`employees\`(id) ON DELETE SET NULL,
      INDEX idx_recurrences_active_next (is_active, next_run)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ticket_recurrences')
}
