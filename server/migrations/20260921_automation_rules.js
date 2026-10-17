// Дрейф схемы: 20260921_automation_rules.sql не применялся (knex берёт только
// *.js, knexfile.js: migrations.extension = 'js'), ни seed.sql таблицу тоже не
// создаёт. FK-колонки объявлены INT UNSIGNED: employees.id создаётся knex'ом как
// UNSIGNED (20260702_000001_create_all_tables.js:4), поэтому с исходным INT FK
// падал с ER_FK_INCOMPATIBLE_COLUMNS — то есть этот SQL не выполнялся никогда,
// даже применённый руками. На свежем проде rules.service.js падал на
// отсутствующей automation_rules (движок правил = 500). Идемпотентно.
export async function up(knex) {
  if (await knex.schema.hasTable('automation_rules')) return

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS \`automation_rules\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      trigger_event VARCHAR(50) NOT NULL,
      conditions JSON NOT NULL,
      actions JSON NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      last_run DATETIME,
      run_count INT DEFAULT 0,
      created_by INT UNSIGNED,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (created_by) REFERENCES \`employees\`(id) ON DELETE SET NULL,
      INDEX idx_rules_active_event (is_active, trigger_event)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('automation_rules')
}
