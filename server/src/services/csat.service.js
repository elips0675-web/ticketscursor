import { randomUUID } from 'crypto'
import prisma from '../prisma.js'
import logger from '../logger.js'

export async function createSurvey(ticketId, requesterEmail) {
  const token = randomUUID().replace(/-/g, '').slice(0, 32)
  const survey = await prisma.csat_surveys.create({
    data: {
      ticket_id: ticketId,
      token,
      requester_email: requesterEmail || null,
      sent_at: new Date(),
    },
  })
  return survey
}

export async function getSurveyByToken(token) {
  const survey = await prisma.csat_surveys.findUnique({
    where: { token },
    select: {
      id: true,
      ticket_id: true,
      rating: true,
      comment: true,
      responded_at: true,
      ticket: {
        select: { title: true, status: true },
      },
    },
  })
  return survey
}

export async function submitResponse(token, { rating, comment }) {
  const survey = await prisma.csat_surveys.findUnique({
    where: { token },
    select: { id: true, responded_at: true },
  })
  if (!survey) {
    const err = new Error('Survey not found')
    err.statusCode = 404
    throw err
  }
  if (survey.responded_at) {
    const err = new Error('Survey already responded')
    err.statusCode = 400
    throw err
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    const err = new Error('Rating must be 1-5')
    err.statusCode = 400
    throw err
  }
  await prisma.csat_surveys.update({
    where: { id: survey.id },
    data: {
      rating,
      comment: comment || null,
      responded_at: new Date(),
    },
  })
  return { success: true }
}

export async function getCsatStats() {
  const total = await prisma.csat_surveys.count({
    where: { responded_at: { not: null } },
  })
  if (total === 0) {
    return { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, responseRate: 0 }
  }

  const rows = await prisma.csat_surveys.groupBy({
    by: ['rating'],
    where: { responded_at: { not: null } },
    _count: { rating: true },
  })

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  for (const row of rows) {
    distribution[row.rating] = row._count.rating
    sum += row.rating * row._count.rating
  }

  const sent = await prisma.csat_surveys.count()
  const responseRate = sent > 0 ? Math.round((total / sent) * 100) : 0

  return {
    total,
    average: Math.round((sum / total) * 10) / 10,
    distribution,
    responseRate,
  }
}

export async function getRecentSurveys(limit = 20) {
  const rows = await prisma.csat_surveys.findMany({
    where: { responded_at: { not: null } },
    orderBy: { responded_at: 'desc' },
    take: limit,
    select: {
      id: true,
      ticket_id: true,
      rating: true,
      comment: true,
      responded_at: true,
      ticket: {
        select: { title: true },
      },
    },
  })
  return rows
}
