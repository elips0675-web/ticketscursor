-- Ticket locking for collision avoidance
ALTER TABLE tickets
  ADD COLUMN locked_by INT NULL,
  ADD COLUMN locked_at DATETIME NULL,
  ADD INDEX idx_tickets_locked_by (locked_by);

-- Foreign key to employees
ALTER TABLE tickets
  ADD CONSTRAINT fk_tickets_locked_by
  FOREIGN KEY (locked_by) REFERENCES employees(id) ON DELETE SET NULL;
