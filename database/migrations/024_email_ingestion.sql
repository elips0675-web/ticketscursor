-- Add email_message_id to tickets for email threading
-- Run: mysql -u root swiftmatch < 024_email_ingestion.sql

ALTER TABLE tickets
  ADD COLUMN email_message_id VARCHAR(500) DEFAULT NULL,
  ADD INDEX idx_tickets_email_message_id (email_message_id(191));
