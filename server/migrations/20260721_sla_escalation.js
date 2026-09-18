export const up = async (knex) => {
  const rows = await knex.raw(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets' AND COLUMN_NAME IN ('escalated_at', 'escalation_level')",
  )
  const existing = new Set(rows[0].map((r) => r.COLUMN_NAME))
  const missing = []
  if (!existing.has('escalated_at')) missing.push('escalated_at')
  if (!existing.has('escalation_level')) missing.push('escalation_level')
  if (missing.length === 0) return
  await knex.schema.alterTable('tickets', (table) => {
    if (missing.includes('escalated_at')) table.timestamp('escalated_at').nullable()
    if (missing.includes('escalation_level')) table.integer('escalation_level').defaultTo(0)
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('tickets', (table) => {
    table.dropColumn('escalated_at')
    table.dropColumn('escalation_level')
  })
}