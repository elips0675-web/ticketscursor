import prisma from '../prisma.js'

const LOCK_TTL_MS = 30 * 60 * 1000

export async function acquireLock(ticketId, userId) {
  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    select: { locked_by: true, locked_at: true, deleted_at: true },
  })

  if (!ticket || ticket.deleted_at) return { error: 'not_found' }

  const now = new Date()
  const lockExpired = !ticket.locked_at || (now - new Date(ticket.locked_at)) > LOCK_TTL_MS

  if (ticket.locked_by && !lockExpired && ticket.locked_by !== userId) {
    const locker = await prisma.employees.findUnique({
      where: { id: ticket.locked_by },
      select: { id: true, name: true },
    })
    return { error: 'locked', lockedBy: locker?.name || 'Unknown', lockedAt: ticket.locked_at }
  }

  await prisma.tickets.update({
    where: { id: ticketId },
    data: { locked_by: userId, locked_at: now },
  })

  return { success: true }
}

export async function releaseLock(ticketId, userId) {
  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    select: { locked_by: true, deleted_at: true },
  })

  if (!ticket || ticket.deleted_at) return { error: 'not_found' }
  if (ticket.locked_by && ticket.locked_by !== userId) return { error: 'not_owner' }

  await prisma.tickets.update({
    where: { id: ticketId },
    data: { locked_by: null, locked_at: null },
  })

  return { success: true }
}

export async function forceRelease(ticketId) {
  await prisma.tickets.update({
    where: { id: ticketId },
    data: { locked_by: null, locked_at: null },
  })
  return { success: true }
}

export async function getLockStatus(ticketId) {
  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    select: { locked_by: true, locked_at: true, deleted_at: true },
  })

  if (!ticket || ticket.deleted_at) return null

  const now = new Date()
  const isExpired = !ticket.locked_at || (now - new Date(ticket.locked_at)) > LOCK_TTL_MS

  if (!ticket.locked_by || isExpired) return { locked: false }

  const locker = await prisma.employees.findUnique({
    where: { id: ticket.locked_by },
    select: { id: true, name: true },
  })

  return {
    locked: true,
    lockedBy: { id: locker?.id, name: locker?.name || 'Unknown' },
    lockedAt: ticket.locked_at,
    expiresAt: new Date(new Date(ticket.locked_at).getTime() + LOCK_TTL_MS),
  }
}
