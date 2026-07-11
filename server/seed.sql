-- Service Desk Database Schema

CREATE DATABASE IF NOT EXISTS servicedesk DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE servicedesk;

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('agent','senior_agent','admin') NOT NULL DEFAULT 'agent',
  department VARCHAR(255) DEFAULT '',
  avatar VARCHAR(500) DEFAULT '',
  phone VARCHAR(50) DEFAULT '',
  online BOOLEAN DEFAULT FALSE,
  active_tickets INT DEFAULT 0,
  resolved_today INT DEFAULT 0,
  title VARCHAR(100) DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  category ENUM('bug','feature','support','incident','other') NOT NULL DEFAULT 'support',
  created_by INT NOT NULL,
  assigned_to INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  sender_id INT NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  sender_avatar VARCHAR(500) DEFAULT '',
  text TEXT NOT NULL,
  attachments JSON DEFAULT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Demo employees (password: 123456)
INSERT INTO employees (name, email, password_hash, role, department, online, active_tickets, resolved_today) VALUES
('Алексей Петров', 'alexey@example.com', '$2a$10$lumiKw.5JxpcyKarKLxGqu1TxqRYGo1asFB4XaQinHTONwY6v5TeC', 'admin', 'IT', TRUE, 3, 5),
('Мария Иванова', 'maria@example.com', '$2a$10$lumiKw.5JxpcyKarKLxGqu1TxqRYGo1asFB4XaQinHTONwY6v5TeC', 'senior_agent', 'Поддержка', TRUE, 2, 8),
('Дмитрий Сидоров', 'dmitry@example.com', '$2a$10$lumiKw.5JxpcyKarKLxGqu1TxqRYGo1asFB4XaQinHTONwY6v5TeC', 'agent', 'Поддержка', FALSE, 4, 3),
('Елена Козлова', 'elena@example.com', '$2a$10$lumiKw.5JxpcyKarKLxGqu1TxqRYGo1asFB4XaQinHTONwY6v5TeC', 'agent', 'Разработка', TRUE, 1, 2),
('Сергей Новиков', 'sergey@example.com', '$2a$10$lumiKw.5JxpcyKarKLxGqu1TxqRYGo1asFB4XaQinHTONwY6v5TeC', 'agent', 'Поддержка', FALSE, 0, 6);

-- Demo tickets
INSERT INTO tickets (title, description, status, priority, category, created_by, assigned_to) VALUES
('Не работает отправка email', 'После обновления сервера перестала работать отправка писем через SMTP', 'in_progress', 'high', 'bug', 10, 1),
('Добавить экспорт в Excel', 'Необходимо добавить кнопку экспорта списка пользователей в Excel', 'open', 'medium', 'feature', 11, NULL),
('Сбой авторизации через Telegram', 'При входе через Telegram выдает ошибку 500', 'open', 'critical', 'incident', 12, 2),
('Обновить документацию API', 'Старая документация не соответствует актуальным эндпоинтам', 'open', 'low', 'other', 13, NULL),
('Медленная загрузка чатов', 'При открытии списка чатов загрузка более 10 секунд', 'resolved', 'high', 'bug', 10, 4);

CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  date DATE NOT NULL,
  time VARCHAR(10),
  description TEXT,
  creator_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO events (title, date, time, description, creator_id) VALUES
('Релиз v2.1', '2026-07-02', '14:00', 'Выпуск обновления системы', 1),
('Митинг команды', '2026-07-03', '10:00', 'Еженедельный митинг разработки', 1),
('Дедлайн T-42', '2026-07-05', NULL, 'Завершить интеграцию с Telegram', 1),
('Планёрка', '2026-07-01', '11:00', 'Обсуждение спринта', 1),
('Обзор безопасности', '2026-07-10', '15:00', 'Аудит безопасности системы', 1);

CREATE TABLE IF NOT EXISTS polls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  multiple_choice BOOLEAN DEFAULT FALSE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS poll_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  poll_id INT NOT NULL,
  text VARCHAR(200) NOT NULL,
  votes_count INT DEFAULT 0,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS poll_votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  poll_id INT NOT NULL,
  option_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY uq_poll_vote (poll_id, option_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS file_folders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  user_id INT NOT NULL,
  is_shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  size VARCHAR(20),
  type VARCHAR(50),
  folder_id INT,
  path VARCHAR(500),
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (folder_id) REFERENCES file_folders(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO file_folders (name, user_id, is_shared) VALUES
('Документы', 1, TRUE), ('Дизайн', 1, TRUE), ('Архив', 1, TRUE), ('Скрипты', 1, TRUE);

INSERT INTO files (name, size, type, folder_id, user_id) VALUES
('Отчёт Q2.pdf', '2.4 MB', 'pdf', 1, 1),
('Договор поставки.docx', '845 KB', 'doc', 1, 1),
('Макет главной.png', '1.8 MB', 'img', 2, 1),
('Логотип.svg', '124 KB', 'code', 2, 1),
('deploy.sh', '2 KB', 'code', 4, 1);

INSERT INTO polls (title, description, multiple_choice, created_by) VALUES
('Какой стек выбрать?', 'Голосуем за технологии', FALSE, 1),
('Удобство интерфейса', 'Оцените новый дизайн', TRUE, 1);

INSERT INTO poll_options (poll_id, text) VALUES
(1, 'React + Node.js'), (1, 'Vue + Python'), (1, 'Next.js + Go'),
(2, 'Всё отлично'), (2, 'Нужно доработать'), (2, 'Неудобно');

CREATE TABLE IF NOT EXISTS wiki_articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100) DEFAULT 'Другое',
  tags JSON DEFAULT NULL,
  author_id INT NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO wiki_articles (title, content, category, tags, author_id, author_name) VALUES
('Как создать заявку', 'Для создания заявки перейдите в раздел «Тикеты» и нажмите «Новый тикет». Заполните форму и отправьте.', 'Руководство', '["тикеты","создание"]', 1, 'Алексей Петров'),
('Правила работы с инцидентами', 'Критические инциденты должны быть назначены в течение 15 минут. Время реакции — не более 1 часа.', 'Правила', '["инциденты","SLA"]', 1, 'Алексей Петров'),
('Настройка email-уведомлений', 'Перейдите в Профиль → Настройки. Включите нужные типы уведомлений.', 'Инструкции', '["email","уведомления"]', 2, 'Мария Иванова'),
('Часто задаваемые вопросы', 'Вопрос: Как сменить пароль? Ответ: Обратитесь к администратору.', 'FAQ', '["вопросы","ответы"]', 3, 'Дмитрий Сидоров'),
('Интеграция с Telegram', 'Для подключения Telegram-бота обратитесь к IT-отделу.', 'Интеграции', '["telegram","бот"]', 1, 'Алексей Петров');

CREATE TABLE IF NOT EXISTS news_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL,
  important BOOLEAN DEFAULT FALSE,
  author_id INT NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO news_posts (title, content, important, author_id, author_name) VALUES
('Запуск новой версии Service Desk 2.1', 'Сегодня состоялся релиз обновления 2.1. Добавлены: улучшенный поиск по тикетам, новый дизайн дашборда.', TRUE, 1, 'Алексей Петров'),
('Изменение графика работы техподдержки', 'С 1 июля техподдержка работает с 8:00 до 20:00 по будням.', FALSE, 2, 'Мария Иванова'),
('Плановые работы на сервере', 'В ночь с 5 на 6 июля с 02:00 до 04:00 будут проводиться технические работы.', TRUE, 1, 'Алексей Петров'),
('Новый сотрудник в команде', 'Приветствуем Елену Павлову — нового разработчика в отделе IT.', FALSE, 1, 'Алексей Петров'),
('Обновление правил SLA', 'Обновлены временные рамки для уровней поддержки. Критические инциденты — реакция до 30 минут.', FALSE, 2, 'Мария Иванова');

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subscription_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_sub (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  type ENUM('group','personal','channel') NOT NULL DEFAULT 'group',
  unread INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chat_id INT NOT NULL,
  sender_id INT NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO chat_rooms (name, type, unread) VALUES
('Общий чат', 'group', 3),
('Разработка', 'group', 1),
('IT-поддержка', 'channel', 0),
('HR — важное', 'group', 0),
('Алексей Петров', 'personal', 2),
('Мария Иванова', 'personal', 0),
('Дмитрий Сидоров', 'personal', 1),
('Елена Козлова', 'personal', 0);

INSERT INTO chat_messages (chat_id, sender_id, sender_name, text, created_at) VALUES
(1, 1, 'Алексей Петров', 'Коллеги, напоминаю о собрании в 15:00', '2026-07-02 14:00:00'),
(1, 2, 'Мария Иванова', 'Принято, буду', '2026-07-02 14:05:00'),
(1, 1, 'Алексей Петров', 'Обновите статусы по тикетам до собрания', '2026-07-02 14:20:00'),
(5, 1, 'Алексей Петров', 'Привет! Сделаешь отчёт до пятницы?', '2026-07-02 14:00:00'),
(5, 5, 'Дмитрий Сидоров', 'Да, без проблем', '2026-07-02 14:30:00'),
(5, 1, 'Алексей Петров', 'Отлично, скинь в общий чат', '2026-07-02 14:35:00');

-- Demo messages
INSERT INTO ticket_messages (ticket_id, sender_id, sender_name, text, created_at) VALUES
(1, 10, 'Иван Клиент', 'Добрый день! После обновления перестала работать отправка почты.', '2026-07-01 09:00:00'),
(1, 1, 'Алексей Петров', 'Здравствуйте! Проверьте настройки SMTP в конфиге. Какая ошибка приходит?', '2026-07-01 09:15:00'),
(1, 10, 'Иван Клиент', 'Connection timed out на порт 587', '2026-07-01 09:30:00'),
(2, 11, 'Ольга Менеджер', 'Требуется экспорт данных в Excel для ежемесячных отчетов.', '2026-07-01 10:00:00'),
(3, 12, 'Павел Техдир', 'Telegram авторизация полностью упала. Срочно нужно исправить!', '2026-07-02 08:00:00'),
(3, 2, 'Мария Иванова', 'Уже смотрю. Проблема в токене бота, обновляю.', '2026-07-02 08:05:00'),
(4, 13, 'Анна Разработчик', 'Документация устарела, нужно обновить.', '2026-06-30 14:00:00'),
(5, 10, 'Иван Клиент', 'Очень долго грузится список чатов.', '2026-06-28 11:00:00'),
(5, 4, 'Елена Козлова', 'Оптимизировала запросы, добавила индексы.', '2026-06-29 16:00:00');

-- Performance indexes
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_updated_at ON tickets(updated_at);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id, created_at);
CREATE INDEX idx_wiki_articles_category ON wiki_articles(category);
CREATE INDEX idx_wiki_articles_updated ON wiki_articles(updated_at);
CREATE INDEX idx_news_posts_important ON news_posts(important, created_at);
CREATE INDEX idx_files_folder ON files(folder_id);
CREATE INDEX idx_events_date ON events(date);
CREATE INDEX idx_chat_messages_chat ON chat_messages(chat_id, created_at);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_employees_role_active ON employees(role, is_active);
