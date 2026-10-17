// Дрейф схемы: файл 20260919_sla_pause.sql лежал в migrations/, но knex
// подхватывает только *.js (knexfile.js: migrations.extension = 'js'), поэтому
// этот SQL никогда не применялся ни `npm run migrate`, ни `npm run setup`,
// ни seed.sql. Колонки добавлял только test-db-setup.js — то есть лишь в
// тестовой БД; на свежем проде tickets.sla_paused_at / sla_accumulated_ms
// отсутствовали, и пауза SLA отвечала 500. Переносим тот же SQL в .js и
// делаем идемпотентным (ALTER ... ADD COLUMN не терпит повторного наката).
export async function up(knex) {
  if (!(await knex.schema.hasColumn('tickets', 'sla_paused_at'))) {
    await knex.raw('ALTER TABLE `tickets` ADD COLUMN `sla_paused_at` DATETIME NULL')
  }
  if (!(await knex.schema.hasColumn('tickets', 'sla_accumulated_ms'))) {
    await knex.raw('ALTER TABLE `tickets` ADD COLUMN `sla_accumulated_ms` INT NOT NULL DEFAULT 0')
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('tickets', 'sla_accumulated_ms')) {
    await knex.raw('ALTER TABLE `tickets` DROP COLUMN `sla_accumulated_ms`')
  }
  if (await knex.schema.hasColumn('tickets', 'sla_paused_at')) {
    await knex.raw('ALTER TABLE `tickets` DROP COLUMN `sla_paused_at`')
  }
}
