CREATE TABLE IF NOT EXISTS ticket_recurrences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
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
  deleted_at DATETIME,
  FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_recurrences_active_next (is_active, next_run)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
