// Серверная часть гейта «schema-drift» (scripts/schema-drift-audit.mjs).
//
// Лежит в server/, потому что knex установлен только здесь. Гейт импортирует
// модуль динамически — только в живом режиме; статические проверки работают без
// зависимостей (см. `--offline`).
//
// Одно соединение на всё: `migrate:latest` и чтение information_schema идут тем
// же пулом. Второй пул к только что созданной временной БД иногда не успевал её
// увидеть (ER_BAD_DB_ERROR, 1 отказ из 3–6 прогонов `--setup` у migrations-lag).
import knexFactory from 'knex'

import { configFor } from './migrations-lag.js'

/**
 * Колонки БД в форме, которую понимает `auditSchema`:
 * `{ tables, columns: [{ table, name, columnType, dataType, nullable, defaultValue }] }`.
 * При `migrate` сначала накатываются миграции — это и есть «свежая выкладка».
 */
export async function readSchema(dbName, { migrate = false } = {}) {
  const knex = knexFactory(configFor(dbName))
  try {
    if (migrate) await knex.migrate.latest()
    const [rows] = await knex.raw(
      'SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT ' +
        'FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION',
      [dbName],
    )
    const columns = rows.map((row) => ({
      table: row.TABLE_NAME,
      name: row.COLUMN_NAME,
      columnType: row.COLUMN_TYPE,
      dataType: row.DATA_TYPE,
      nullable: row.IS_NULLABLE === 'YES',
      defaultValue: row.COLUMN_DEFAULT,
    }))
    return { tables: [...new Set(columns.map((column) => column.table))], columns }
  } finally {
    await knex.destroy()
  }
}
