// Этап 66 (подфича 1): GDPR-экспорт данных пользователя.
// GET /api/gdpr/export — полный JSON со всеми данными сотрудника (профиль, тикеты,
// сообщения, чаты, файлы, wiki, опросы, уведомления, аудит).
// Доступен любому авторизованному пользователю (только свои данные), включён флагом
// «gdpr_export» (по умолчанию OFF, правило «фича = флаг»).
import { Router } from 'express'
import prisma from '../prisma.js'
import { authenticateToken } from '../middleware.js'
import { isFeatureEnabled } from '../feature-flags.js'
import logger from '../logger.js'

const router = Router()

router.use(authenticateToken)

router.get('/export', async (req, res) => {
  try {
    if (!(await isFeatureEnabled('gdpr_export'))) {
      return res.status(404).json({ success: false, message: 'Not found' })
    }
    const userId = req.user.userId

    const [profile, createdTickets, assignedTickets, ticketMessages, chatMessages, files, wikiArticles, polls, pollVotes, notifications, auditLog] =
      await Promise.all([
        prisma.employees.findUnique({ where: { id: userId } }),
        prisma.tickets.findMany({ where: { created_by: userId, deleted_at: null }, orderBy: { created_at: 'asc' } }),
        prisma.tickets.findMany({ where: { assigned_to: userId, deleted_at: null }, orderBy: { created_at: 'asc' } }),
        prisma.ticket_messages.findMany({
          where: { sender_id: userId, deleted_at: null },
          orderBy: { created_at: 'asc' },
          select: { id: true, ticket_id: true, text: true, created_at: true },
        }),
        prisma.chat_messages.findMany({
          where: { sender_id: userId, deleted_at: null },
          orderBy: { created_at: 'asc' },
          select: { id: true, chat_id: true, text: true, created_at: true, edited_at: true },
        }),
        prisma.files.findMany({
          where: { user_id: userId, deleted_at: null },
          orderBy: { created_at: 'asc' },
          select: { id: true, name: true, size: true, type: true, folder_id: true, created_at: true },
        }),
        prisma.wiki_articles.findMany({
          where: { author_id: userId },
          orderBy: { created_at: 'asc' },
          select: { id: true, title: true, category: true, tags: true, created_at: true, updated_at: true },
        }),
        prisma.polls.findMany({
          where: { created_by: userId },
          orderBy: { created_at: 'asc' },
          select: { id: true, title: true, description: true, created_at: true },
        }),
        prisma.poll_votes.findMany({
          where: { user_id: userId },
          orderBy: { created_at: 'asc' },
          select: { id: true, poll_id: true, option_id: true, created_at: true },
        }),
        prisma.notifications.findMany({
          where: { user_id: userId },
          orderBy: { created_at: 'asc' },
          select: { id: true, type: true, title: true, body: true, link: true, is_read: true, created_at: true },
        }),
        prisma.audit_log.findMany({
          where: { user_id: userId },
          orderBy: { created_at: 'asc' },
          take: 500,
          select: { id: true, action: true, entity_type: true, entity_id: true, details: true, created_at: true },
        }),
      ])

    const data = {
      exported_at: new Date().toISOString(),
      user: profile,
      tickets_created: createdTickets,
      tickets_assigned: assignedTickets,
      ticket_messages: ticketMessages,
      chat_messages: chatMessages,
      files,
      wiki_articles: wikiArticles,
      polls,
      poll_votes: pollVotes,
      notifications,
      audit_log: auditLog,
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="gdpr-export-user-${userId}.json"`)
    res.json({ success: true, data })
  } catch (err) {
    logger.error('GDPR export error:', err)
    res.status(500).json({ success: false, message: 'Ошибка экспорта данных' })
  }
})

export default router