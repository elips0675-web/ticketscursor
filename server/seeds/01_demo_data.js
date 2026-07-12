const PASSWORD_HASH = '$2a$10$nC7/hzotFOk5Qn8OLCoErut65ybvbbovuxrTRr9MG7EGWs8Tindgy' // bcrypt('123456')

export async function seed(knex) {
  await knex('poll_votes').del()
  await knex('poll_options').del()
  await knex('polls').del()
  await knex('chat_messages').del()
  await knex('chat_rooms').del()
  await knex('ticket_messages').del()
  await knex('tickets').del()
  await knex('files').del()
  await knex('file_folders').del()
  await knex('events').del()
  await knex('news_posts').del()
  await knex('wiki_articles').del()
  await knex('push_subscriptions').del()
  await knex('employees').del()

  await knex('employees').insert([
    { id: 1, name: 'Алексей Петров', email: 'alexey@example.com', password_hash: PASSWORD_HASH, role: 'super_admin', department: 'IT', online: true, active_tickets: 3, resolved_today: 5 },
    { id: 2, name: 'Мария Иванова', email: 'maria@example.com', password_hash: PASSWORD_HASH, role: 'senior_agent', department: 'Поддержка', online: true, active_tickets: 2, resolved_today: 8 },
    { id: 3, name: 'Дмитрий Сидоров', email: 'dmitry@example.com', password_hash: PASSWORD_HASH, role: 'agent', department: 'Поддержка', online: false, active_tickets: 4, resolved_today: 3 },
    { id: 4, name: 'Елена Козлова', email: 'elena@example.com', password_hash: PASSWORD_HASH, role: 'agent', department: 'Разработка', online: true, active_tickets: 1, resolved_today: 2 },
    { id: 5, name: 'Сергей Новиков', email: 'sergey@example.com', password_hash: PASSWORD_HASH, role: 'agent', department: 'Поддержка', online: false, active_tickets: 0, resolved_today: 6 },
  ])

  await knex('tickets').insert([
    { id: 1, title: 'Не работает отправка email', description: 'После обновления сервера перестала работать отправка писем через SMTP', status: 'in_progress', priority: 'high', category: 'bug', created_by: 10, assigned_to: 1 },
    { id: 2, title: 'Добавить экспорт в Excel', description: 'Необходимо добавить кнопку экспорта списка пользователей в Excel', status: 'open', priority: 'medium', category: 'feature', created_by: 11 },
    { id: 3, title: 'Сбой авторизации через Telegram', description: 'При входе через Telegram выдает ошибку 500', status: 'open', priority: 'critical', category: 'incident', created_by: 12, assigned_to: 2 },
    { id: 4, title: 'Обновить документацию API', description: 'Старая документация не соответствует актуальным эндпоинтам', status: 'open', priority: 'low', category: 'other', created_by: 13 },
    { id: 5, title: 'Медленная загрузка чатов', description: 'При открытии списка чатов загрузка более 10 секунд', status: 'resolved', priority: 'high', category: 'bug', created_by: 10, assigned_to: 4 },
  ])

  await knex('ticket_messages').insert([
    { id: 1, ticket_id: 1, sender_id: 10, sender_name: 'Иван Клиент', text: 'Добрый день! После обновления перестала работать отправка почты.', created_at: '2026-07-01 09:00:00' },
    { id: 2, ticket_id: 1, sender_id: 1, sender_name: 'Алексей Петров', text: 'Здравствуйте! Проверьте настройки SMTP в конфиге. Какая ошибка приходит?', created_at: '2026-07-01 09:15:00' },
    { id: 3, ticket_id: 1, sender_id: 10, sender_name: 'Иван Клиент', text: 'Connection timed out на порт 587', created_at: '2026-07-01 09:30:00' },
    { id: 4, ticket_id: 2, sender_id: 11, sender_name: 'Ольга Менеджер', text: 'Требуется экспорт данных в Excel для ежемесячных отчетов.', created_at: '2026-07-01 10:00:00' },
    { id: 5, ticket_id: 3, sender_id: 12, sender_name: 'Павел Техдир', text: 'Telegram авторизация полностью упала. Срочно нужно исправить!', created_at: '2026-07-02 08:00:00' },
    { id: 6, ticket_id: 3, sender_id: 2, sender_name: 'Мария Иванова', text: 'Уже смотрю. Проблема в токене бота, обновляю.', created_at: '2026-07-02 08:05:00' },
    { id: 7, ticket_id: 4, sender_id: 13, sender_name: 'Анна Разработчик', text: 'Документация устарела, нужно обновить.', created_at: '2026-06-30 14:00:00' },
    { id: 8, ticket_id: 5, sender_id: 10, sender_name: 'Иван Клиент', text: 'Очень долго грузится список чатов.', created_at: '2026-06-28 11:00:00' },
    { id: 9, ticket_id: 5, sender_id: 4, sender_name: 'Елена Козлова', text: 'Оптимизировала запросы, добавила индексы.', created_at: '2026-06-29 16:00:00' },
  ])

  await knex('events').insert([
    { title: 'Релиз v2.1', date: '2026-07-02', time: '14:00', description: 'Выпуск обновления системы', creator_id: 1 },
    { title: 'Митинг команды', date: '2026-07-03', time: '10:00', description: 'Еженедельный митинг разработки', creator_id: 1 },
    { title: 'Дедлайн T-42', date: '2026-07-05', description: 'Завершить интеграцию с Telegram', creator_id: 1 },
    { title: 'Планёрка', date: '2026-07-01', time: '11:00', description: 'Обсуждение спринта', creator_id: 1 },
    { title: 'Обзор безопасности', date: '2026-07-10', time: '15:00', description: 'Аудит безопасности системы', creator_id: 1 },
  ])

  await knex('file_folders').insert([
    { id: 1, name: 'Документы', user_id: 1, is_shared: true },
    { id: 2, name: 'Дизайн', user_id: 1, is_shared: true },
    { id: 3, name: 'Архив', user_id: 1, is_shared: true },
    { id: 4, name: 'Скрипты', user_id: 1, is_shared: true },
  ])

  await knex('files').insert([
    { name: 'Отчёт Q2.pdf', size: '2.4 MB', type: 'pdf', folder_id: 1, user_id: 1, path: '/uploads/files/otchyot-q2.pdf' },
    { name: 'Договор поставки.docx', size: '845 KB', type: 'doc', folder_id: 1, user_id: 1, path: '/uploads/files/dogovor-postavki.docx' },
    { name: 'Макет главной.png', size: '1.8 MB', type: 'img', folder_id: 2, user_id: 1, path: '/uploads/files/maket-glavnoy.png' },
    { name: 'Логотип.svg', size: '124 KB', type: 'code', folder_id: 2, user_id: 1, path: '/uploads/files/logotip.svg' },
    { name: 'deploy.sh', size: '2 KB', type: 'code', folder_id: 4, user_id: 1, path: '/uploads/files/deploy.sh' },
  ])

  await knex('polls').insert([
    { id: 1, title: 'Какой стек выбрать?', description: 'Голосуем за технологии', created_by: 1 },
    { id: 2, title: 'Удобство интерфейса', description: 'Оцените новый дизайн', multiple_choice: true, created_by: 1 },
  ])

  await knex('poll_options').insert([
    { poll_id: 1, text: 'React + Node.js' },
    { poll_id: 1, text: 'Vue + Python' },
    { poll_id: 1, text: 'Next.js + Go' },
    { poll_id: 2, text: 'Всё отлично' },
    { poll_id: 2, text: 'Нужно доработать' },
    { poll_id: 2, text: 'Неудобно' },
  ])

  await knex('wiki_articles').insert([
    { title: 'Как создать заявку', content: 'Для создания заявки перейдите в раздел «Тикеты» и нажмите «Новый тикет». Заполните форму и отправьте.', category: 'Руководство', tags: JSON.stringify(['тикеты', 'создание']), author_id: 1, author_name: 'Алексей Петров' },
    { title: 'Правила работы с инцидентами', content: 'Критические инциденты должны быть назначены в течение 15 минут. Время реакции — не более 1 часа.', category: 'Правила', tags: JSON.stringify(['инциденты', 'SLA']), author_id: 1, author_name: 'Алексей Петров' },
    { title: 'Настройка email-уведомлений', content: 'Перейдите в Профиль → Настройки. Включите нужные типы уведомлений.', category: 'Инструкции', tags: JSON.stringify(['email', 'уведомления']), author_id: 2, author_name: 'Мария Иванова' },
    { title: 'Часто задаваемые вопросы', content: 'Вопрос: Как сменить пароль? Ответ: Обратитесь к администратору.', category: 'FAQ', tags: JSON.stringify(['вопросы', 'ответы']), author_id: 3, author_name: 'Дмитрий Сидоров' },
    { title: 'Интеграция с Telegram', content: 'Для подключения Telegram-бота обратитесь к IT-отделу.', category: 'Интеграции', tags: JSON.stringify(['telegram', 'бот']), author_id: 1, author_name: 'Алексей Петров' },
  ])

  await knex('news_posts').insert([
    { title: 'Запуск новой версии Service Desk 2.1', content: 'Сегодня состоялся релиз обновления 2.1. Добавлены: улучшенный поиск по тикетам, новый дизайн дашборда.', important: true, author_id: 1, author_name: 'Алексей Петров' },
    { title: 'Изменение графика работы техподдержки', content: 'С 1 июля техподдержка работает с 8:00 до 20:00 по будням.', important: false, author_id: 2, author_name: 'Мария Иванова' },
    { title: 'Плановые работы на сервере', content: 'В ночь с 5 на 6 июля с 02:00 до 04:00 будут проводиться технические работы.', important: true, author_id: 1, author_name: 'Алексей Петров' },
    { title: 'Новый сотрудник в команде', content: 'Приветствуем Елену Павлову — нового разработчика в отделе IT.', important: false, author_id: 1, author_name: 'Алексей Петров' },
    { title: 'Обновление правил SLA', content: 'Обновлены временные рамки для уровней поддержки. Критические инциденты — реакция до 30 минут.', important: false, author_id: 2, author_name: 'Мария Иванова' },
  ])

  await knex('chat_rooms').insert([
    { id: 1, name: 'Общий чат', type: 'group', unread: 3 },
    { id: 2, name: 'Разработка', type: 'group', unread: 1 },
    { id: 3, name: 'IT-поддержка', type: 'channel', unread: 0 },
    { id: 4, name: 'HR — важное', type: 'group', unread: 0 },
    { id: 5, name: 'Алексей Петров', type: 'personal', unread: 2 },
    { id: 6, name: 'Мария Иванова', type: 'personal', unread: 0 },
    { id: 7, name: 'Дмитрий Сидоров', type: 'personal', unread: 1 },
    { id: 8, name: 'Елена Козлова', type: 'personal', unread: 0 },
  ])

  await knex('chat_messages').insert([
    { chat_id: 1, sender_id: 1, sender_name: 'Алексей Петров', text: 'Коллеги, напоминаю о собрании в 15:00', created_at: '2026-07-02 14:00:00' },
    { chat_id: 1, sender_id: 2, sender_name: 'Мария Иванова', text: 'Принято, буду', created_at: '2026-07-02 14:05:00' },
    { chat_id: 1, sender_id: 1, sender_name: 'Алексей Петров', text: 'Обновите статусы по тикетам до собрания', created_at: '2026-07-02 14:20:00' },
    { chat_id: 5, sender_id: 1, sender_name: 'Алексей Петров', text: 'Привет! Сделаешь отчёт до пятницы?', created_at: '2026-07-02 14:00:00' },
    { chat_id: 5, sender_id: 3, sender_name: 'Дмитрий Сидоров', text: 'Да, без проблем', created_at: '2026-07-02 14:30:00' },
    { chat_id: 5, sender_id: 1, sender_name: 'Алексей Петров', text: 'Отлично, скинь в общий чат', created_at: '2026-07-02 14:35:00' },
  ])
}
