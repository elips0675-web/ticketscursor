import prisma from '../prisma.js'

export async function listTimeEntries(ticketId, limit = 50) {
  return prisma.time_entries.findMany({
    where: { ticket_id: ticketId },
    include: {
      user: {
        select: { id: true, name: true, avatar: true },
      },
    },
    orderBy: { created_at: 'desc' },
    take: Math.min(200, Math.max(1, limit)),
  })
}

export async function getTimeTotals(ticketId) {
  const agg = await prisma.time_entries.aggregate({
    where: { ticket_id: ticketId },
    _sum: { minutes: true },
    _count: true,
  })
  return { totalMinutes: agg._sum.minutes || 0, totalEntries: agg._count }
}

export async function addTimeEntry({ ticketId, userId, minutes, description }) {
  return prisma.time_entries.create({
    data: {
      ticket_id: ticketId,
      user_id: userId,
      minutes,
      description: description || '',
      entry_date: new Date(),
    },
    include: {
      user: {
        select: { id: true, name: true, avatar: true },
      },
    },
  })
}

export async function getTimeEntryById(entryId) {
  return prisma.time_entries.findUnique({ where: { id: entryId } })
}

export async function deleteTimeEntry(entryId) {
  return prisma.time_entries.delete({ where: { id: entryId } })
}

export async function getActiveTimer(ticketId, userId) {
  return prisma.ticket_timers.findUnique({
    where: { ticket_id_user_id: { ticket_id: ticketId, user_id: userId } },
  })
}

export async function startTimer(ticketId, userId) {
  const existing = await getActiveTimer(ticketId, userId)
  if (existing) return existing
  return prisma.ticket_timers.create({
    data: { ticket_id: ticketId, user_id: userId, started_at: new Date() },
  })
}

export async function stopTimer(ticketId, userId) {
  const timer = await getActiveTimer(ticketId, userId)
  if (!timer) return null
  const elapsedMs = Date.now() - new Date(timer.started_at).getTime()
  const minutes = Math.max(1, Math.round(elapsedMs / (60 * 1000)))
  await prisma.ticket_timers.delete({ where: { id: timer.id } })
  const entry = await prisma.time_entries.create({
    data: {
      ticket_id: ticketId,
      user_id: userId,
      minutes,
      description: '',
      entry_date: new Date(timer.started_at),
    },
    include: {
      user: {
        select: { id: true, name: true, avatar: true },
      },
    },
  })
  return { timer, minutes, entry }
}

export function formatDuration(minutes) {
  const totalMinutes = Math.max(0, Math.round(minutes))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return { hours: h, minutes: m }
}