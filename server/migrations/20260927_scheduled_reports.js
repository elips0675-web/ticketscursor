// Этап 66 (подфича 4): Scheduled reports — планировщик отчётов с cron-расписанием.
// Таблица scheduled_reports (name, report_type, recipients JSON, cron_expr, enabled,
// last_run_at, next_run_at, created_by) + флаг «scheduled_reports» (дефолт — OFF,
// правило «фича = флаг»).
// Idempotent: таблица/флаг создаются только если их ещё нет.
export async function up(knex) {
  const exists = await knex.schema.hasTable('scheduled_reports')
  if (!exists) {
    await knex.schema.createTable('scheduled_reports', (table) => {
      table.increments('id')
      table.string('name', 200).notNullable()
      table.string('report_type', 50).notNullable().defaultTo('tickets_summary')
      table.json('recipients')
      table.string('cron_expr', 100).notNullable().defaultTo('0 9 * * 1-5')
      table.boolean('enabled').defaultTo(false)
      table.timestamp('last_run_at').nullable()
      table.timestamp('next_run_at').nullable()
      table.integer('created_by').nullable()
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
  const ff = await knex.schema.hasTable('feature_flags')
  if (ff) {
    const row = await knex('feature_flags').where({ key: 'scheduled_reports' }).first()
    if (!row) {
      await knex('feature_flags').insert({
        key: 'scheduled_reports',
        enabled: false,
        description: 'Планируемые отчёты: cron-расписание + email-доставка сводок (тикеты/SLA/CSAT)',
      })
    }
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('scheduled_reports')
  await knex('feature_flags').where({ key: 'scheduled_reports' }).del()
}