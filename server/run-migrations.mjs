import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const migrations = [
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    prefix VARCHAR(12) NOT NULL,
    scopes TEXT,
    expires_at DATETIME,
    last_used DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE,
    INDEX idx_api_tokens_user_id (user_id),
    INDEX idx_api_tokens_token_hash (token_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS webhooks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    secret VARCHAR(255),
    events TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_status INT,
    last_error TEXT,
    last_triggered_at DATETIME,
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL,
    INDEX idx_webhooks_active (is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS automation_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    trigger_event VARCHAR(50) NOT NULL,
    conditions JSON NOT NULL,
    actions JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_run DATETIME,
    run_count INT DEFAULT 0,
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL,
    INDEX idx_rules_active_event (is_active, trigger_event)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ticket_recurrences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium',
    category VARCHAR(50),
    assigned_to INT,
    cron_expr VARCHAR(100) NOT NULL,
    next_run DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    last_run DATETIME,
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL,
    INDEX idx_recurrences_active (is_active, next_run)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

async function main() {
  for (const sql of migrations) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] || 'unknown'
    try {
      await prisma.$executeRawUnsafe(sql)
      console.log(`✅ ${tableName} — created`)
    } catch (e) {
      console.log(`⚠️  ${tableName} — ${e.message}`)
    }
  }

  // Add columns to tickets
  const alters = [
    `ALTER TABLE tickets ADD COLUMN locked_by INT NULL`,
    `ALTER TABLE tickets ADD COLUMN locked_at DATETIME NULL`,
    `ALTER TABLE tickets ADD COLUMN email_message_id VARCHAR(255) NULL`,
  ]

  for (const sql of alters) {
    try {
      await prisma.$executeRawUnsafe(sql)
    } catch { /* already exists */ }
  }

  console.log('\n✅ All migrations complete')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
