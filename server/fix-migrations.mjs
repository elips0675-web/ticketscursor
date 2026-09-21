import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const fixes = [
    // Add deleted_at to ticket_recurrences (missing from original migration)
    `ALTER TABLE ticket_recurrences ADD COLUMN deleted_at DATETIME NULL`,

    // Add deleted_at to automation_rules if missing
    `ALTER TABLE automation_rules ADD COLUMN deleted_at DATETIME NULL`,
  ]

  for (const sql of fixes) {
    const label = sql.match(/ALTER TABLE (\w+)/)?.[1] || 'unknown'
    try {
      await prisma.$executeRawUnsafe(sql)
      console.log(`✅ ${label} — column added`)
    } catch (e) {
      // column already exists
      if (e.message?.includes('Duplicate column')) {
        console.log(`⏭️  ${label} — already exists`)
      } else {
        console.log(`⚠️  ${label} — ${e.message}`)
      }
    }
  }

  console.log('\n✅ Fixes complete')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
