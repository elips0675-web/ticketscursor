// Этап 66 (подфича 2): Org chart — GET /api/team/org-chart (дерево сотрудников по manager_id).
// Отдельный роутер без cacheMiddleware: список активен в реальном времени.
// Фича включена флагом «org_chart» (дефолт — OFF, правило «фича = флаг»).
import { Router } from 'express'
import prisma from '../prisma.js'
import { authenticateToken } from '../middleware.js'
import { isFeatureEnabled } from '../feature-flags.js'
import logger from '../logger.js'

const router = Router()

router.use(authenticateToken)

router.get('/org-chart', async (req, res) => {
  try {
    if (!(await isFeatureEnabled('org_chart'))) {
      return res.status(404).json({ success: false, message: 'Not found' })
    }
    const rows = await prisma.employees.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        title: true,
        avatar: true,
        online: true,
        manager_id: true,
      },
      orderBy: { name: 'asc' },
    })
    res.json({ success: true, data: rows })
  } catch (err) {
    logger.error('Org chart error:', err)
    res.status(500).json({ success: false, message: 'Ошибка загрузки оргструктуры' })
  }
})

export default router