import { Router } from 'express'
import prisma from '../prisma.js'
import { authenticateToken, requireRole } from '../middleware.js'
import { getSettings } from '../settings.js'
import { buildTemplateContext, resolveTemplateVariables } from '../services/template-variables.js'
import logger from '../logger.js'

const router = Router()
router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const rows = await prisma.canned_responses.findMany({
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    })
    res.json({ success: true, data: rows })
  } catch (err) {
    logger.error('Canned responses list error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch canned responses' })
  }
})

router.post('/', requireRole('admin', 'senior_agent'), async (req, res) => {
  const { title, text, category } = req.body
  if (!title || !text) {
    return res.status(400).json({ success: false, message: 'Title and text are required' })
  }
  try {
    const row = await prisma.canned_responses.create({
      data: { title, text, category: category || '', created_by: req.user.userId },
    })
    res.status(201).json({ success: true, data: row })
  } catch (err) {
    logger.error('Canned response create error:', err)
    res.status(500).json({ success: false, message: 'Failed to create canned response' })
  }
})

router.post('/:id/render', async (req, res) => {
  const id = Number(req.params.id)
  const ticketId = Number(req.body?.ticketId)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid canned response id' })
  }
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ success: false, code: 'INVALID_TICKET_ID', message: 'ticketId is required' })
  }
  try {
    const canned = await prisma.canned_responses.findUnique({ where: { id } })
    if (!canned) return res.status(404).json({ success: false, message: 'Not found' })

    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        created_by_employee: { select: { name: true, email: true } },
        assigned_to_employee: { select: { name: true, email: true } },
      },
    })
    if (!ticket) {
      return res.status(404).json({ success: false, code: 'TICKET_NOT_FOUND', message: 'Ticket not found' })
    }

    const settings = await getSettings().catch(() => ({}))
    const context = buildTemplateContext({
      ticket,
      customer: ticket.created_by_employee,
      agent: ticket.assigned_to_employee,
      company: { name: settings.COMPANY_NAME || 'Service Desk' },
    })

    res.json({
      success: true,
      data: {
        id: canned.id,
        title: canned.title,
        category: canned.category,
        text: resolveTemplateVariables(canned.text, context),
      },
    })
  } catch (err) {
    logger.error('Canned response render error:', err)
    res.status(500).json({ success: false, message: 'Failed to render canned response' })
  }
})

router.put('/:id', requireRole('admin', 'senior_agent'), async (req, res) => {
  const id = Number(req.params.id)
  const { title, text, category } = req.body
  try {
    const existing = await prisma.canned_responses.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' })
    const row = await prisma.canned_responses.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(text !== undefined && { text }),
        ...(category !== undefined && { category }),
        updated_at: new Date(),
      },
    })
    res.json({ success: true, data: row })
  } catch (err) {
    logger.error('Canned response update error:', err)
    res.status(500).json({ success: false, message: 'Failed to update canned response' })
  }
})

router.delete('/:id', requireRole('admin', 'senior_agent'), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const existing = await prisma.canned_responses.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' })
    await prisma.canned_responses.delete({ where: { id } })
    res.json({ success: true, data: { deleted: true } })
  } catch (err) {
    logger.error('Canned response delete error:', err)
    res.status(500).json({ success: false, message: 'Failed to delete canned response' })
  }
})

export default router