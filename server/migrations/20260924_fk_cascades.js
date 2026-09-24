// Этап 59 — каскады FK (onDelete): dev-БД имела только 7 из ~30 ограничений
// (таблицы были созданы из seed.sql, базовая миграция не накатилась).
// Миграция идемпотентна: добавляет только отсутствующие FK, чистит orphan-строки,
// при ошибке — warn и continue (не роняет накат).
const FK_MAP = [
  // { table, column, ref, onDelete } — onDelete согласован с schema.prisma
  { table: 'tickets', column: 'created_by', ref: 'employees', onDelete: 'RESTRICT' },
  { table: 'tickets', column: 'assigned_to', ref: 'employees', onDelete: 'SET NULL' },
  { table: 'ticket_messages', column: 'ticket_id', ref: 'tickets', onDelete: 'CASCADE' },
  { table: 'ticket_messages', column: 'sender_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'events', column: 'creator_id', ref: 'employees', onDelete: 'SET NULL' },
  { table: 'polls', column: 'created_by', ref: 'employees', onDelete: 'SET NULL' },
  { table: 'poll_options', column: 'poll_id', ref: 'polls', onDelete: 'CASCADE' },
  { table: 'poll_votes', column: 'poll_id', ref: 'polls', onDelete: 'CASCADE' },
  { table: 'poll_votes', column: 'option_id', ref: 'poll_options', onDelete: 'CASCADE' },
  { table: 'poll_votes', column: 'user_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'file_folders', column: 'user_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'files', column: 'folder_id', ref: 'file_folders', onDelete: 'CASCADE' },
  { table: 'files', column: 'user_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'chat_messages', column: 'chat_id', ref: 'chat_rooms', onDelete: 'CASCADE' },
  { table: 'chat_messages', column: 'sender_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'wiki_articles', column: 'author_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'news_posts', column: 'author_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'push_subscriptions', column: 'user_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'refresh_tokens', column: 'user_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'notifications', column: 'user_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'time_entries', column: 'ticket_id', ref: 'tickets', onDelete: 'CASCADE' },
  { table: 'time_entries', column: 'user_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'ticket_timers', column: 'ticket_id', ref: 'tickets', onDelete: 'CASCADE' },
  { table: 'ticket_timers', column: 'user_id', ref: 'employees', onDelete: 'CASCADE' },
  { table: 'csat_surveys', column: 'ticket_id', ref: 'tickets', onDelete: 'CASCADE' },
]

export async function up(knex) {
  for (const fk of FK_MAP) {
    const name = `fk_${fk.table}_${fk.column}`
    try {
      const [rows] = await knex.raw(
        `SELECT COUNT(*) AS c FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME = ?`,
        [fk.table, fk.column, fk.ref],
      )
      if (rows[0].c > 0) continue

      // Orphan-строки (FK не добавится при dangling-данных) — удаляем.
      await knex.raw(
        `DELETE t FROM \`${fk.table}\` t LEFT JOIN \`${fk.ref}\` r ON r.id = t.\`${fk.column}\`
         WHERE t.\`${fk.column}\` IS NOT NULL AND r.id IS NULL`,
      )
      await knex.raw(
        `ALTER TABLE \`${fk.table}\`
         ADD CONSTRAINT \`${name}\`
         FOREIGN KEY (\`${fk.column}\`) REFERENCES \`${fk.ref}\`(\`id\`)
         ON DELETE ${fk.onDelete}`,
      )
    } catch (e) {
      console.warn(`[fk-cascades] skip ${name}: ${e.message}`)
    }
  }
}

export function down(knex) {
  return Promise.all(
    FK_MAP.map(fk =>
      knex.raw(`ALTER TABLE \`${fk.table}\` DROP FOREIGN KEY \`fk_${fk.table}_${fk.column}\``).catch(() => {}),
    ),
  )
}