// Дрейф схемы: 20260921_webhooks_api_tokens.sql не применялся (knex берёт только
// *.js), ни seed.sql эти таблицы не создаёт. На свежем проде
// webhooks.service.js и api-tokens.service.js падали на отсутствующих
// webhooks / api_tokens. Тот же SQL (два CREATE), с правкой FK-колонок на
// INT UNSIGNED (employees.id = UNSIGNED, иначе ER_FK_INCOMPATIBLE_COLUMNS —
// исходный SQL не выполнялся никогда). Идемпотентно.
export async function up(knex) {
  if (!(await knex.schema.hasTable('api_tokens'))) {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS \`api_tokens\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        name VARCHAR(255) NOT NULL,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        prefix VARCHAR(12) NOT NULL,
        scopes TEXT,
        expires_at DATETIME,
        last_used DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES \`employees\`(id) ON DELETE CASCADE,
        INDEX idx_api_tokens_user_id (user_id),
        INDEX idx_api_tokens_token_hash (token_hash)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  if (!(await knex.schema.hasTable('webhooks'))) {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS \`webhooks\` (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(500) NOT NULL,
        secret VARCHAR(255),
        events TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        last_status INT,
        last_error TEXT,
        last_triggered_at DATETIME,
        created_by INT UNSIGNED,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY (created_by) REFERENCES \`employees\`(id) ON DELETE SET NULL,
        INDEX idx_webhooks_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('webhooks')
  await knex.schema.dropTableIfExists('api_tokens')
}
