export async function up(knex) {
  const hasCol = await knex.schema.hasColumn('refresh_tokens', 'family_id')
  if (!hasCol) {
    await knex.schema.alterTable('refresh_tokens', (t) => {
      t.string('family_id', 36).nullable()
      t.index(['family_id'], 'idx_refresh_tokens_family')
    })
  }
}

export function down(knex) {
  return knex.schema.alterTable('refresh_tokens', (t) => {
    t.dropIndex('idx_refresh_tokens_family')
    t.dropColumn('family_id')
  })
}