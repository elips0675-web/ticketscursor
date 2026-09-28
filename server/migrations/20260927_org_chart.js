// Этап 66 (подфича 2): Org chart — колонка employees.manager_id (self-FK, nullable)
// + флаг «org_chart» (дефолт — OFF, правило «фича = флаг»).
// Idempotent: колонка и флаг создаются только если их ещё нет.
export async function up(knex) {
  const cols = await knex('information_schema.columns')
    .where({
      table_schema: knex.client.config.connection.database,
      table_name: 'employees',
      column_name: 'manager_id',
    })
    .select('column_name as cn')
  if (cols.length === 0) {
    // MySQL FK требует совпадения знака id: новая тестовая БД — unsigned, legacy dev-БД — signed.
    let referencedUnsigned = true
    try {
      const rows = await knex('information_schema.columns')
        .where({
          table_schema: knex.client.config.connection.database,
          table_name: 'employees',
          column_name: 'id',
        })
        .select('column_type as ct')
      referencedUnsigned = rows[0] ? String(rows[0].ct).includes('unsigned') : true
    } catch {
      /* keep default unsigned */
    }
    await knex.schema.alterTable('employees', (table) => {
      if (referencedUnsigned) {
        table.integer('manager_id').unsigned().nullable()
      } else {
        table.integer('manager_id').nullable()
      }
      const fk = table.foreign('manager_id').references('employees.id')
      if (referencedUnsigned) fk.onDelete('SET NULL')
    })
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'org_chart' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'org_chart',
        enabled: false,
        description: 'Оргструктура: страница «Команда» с деревом по manager_id',
      })
    }
  }
}

export async function down(knex) {
  await knex('feature_flags').where({ key: 'org_chart' }).del()
  await knex.schema.alterTable('employees', (table) => {
    table.dropForeign(['manager_id'])
    table.dropColumn('manager_id')
  })
}