export async function up(knex) {
  const [cols] = await knex.raw('SHOW COLUMNS FROM feature_flags')
  const names = cols.map((c) => c.Field)
  if (!names.includes('rollout_percent')) {
    await knex.schema.alterTable('feature_flags', (t) => t.integer('rollout_percent').notNullable().defaultTo(100))
  }
}

export function down(knex) {
  return knex.schema.alterTable('feature_flags', (t) => t.dropColumn('rollout_percent'))
}