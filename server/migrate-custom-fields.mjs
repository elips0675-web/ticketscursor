import 'dotenv/config'
import mysql from 'mysql2/promise'

const c = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  database: 'servicedesk',
})

await c.execute(`
  CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL,
    options JSON,
    required BOOLEAN DEFAULT FALSE,
    category VARCHAR(50) DEFAULT 'general',
    sort_order INT DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`)
console.log('custom_field_definitions created')

await c.execute(`
  CREATE TABLE IF NOT EXISTS custom_field_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_id INT NOT NULL,
    ticket_id INT NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cf_field_ticket (field_id, ticket_id),
    INDEX idx_cf_ticket (ticket_id),
    CONSTRAINT fk_cf_field FOREIGN KEY (field_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
    CONSTRAINT fk_cf_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`)
console.log('custom_field_values created')

await c.end()
