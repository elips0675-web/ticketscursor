CREATE TABLE IF NOT EXISTS automation_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  trigger_event VARCHAR(50) NOT NULL,
  conditions JSON NOT NULL,
  actions JSON NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_run DATETIME,
  run_count INT UNSIGNED DEFAULT 0,
  created_by INT UNSIGNED,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_rules_active_event (is_active, trigger_event)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
