import { Router } from 'express'
import { getSurveyByToken, submitResponse } from '../services/csat.service.js'
import logger from '../logger.js'

const router = Router()

router.get('/:token', async (req, res) => {
  try {
    const survey = await getSurveyByToken(req.params.token)
    if (!survey) return res.status(404).json({ success: false, message: 'Survey not found' })
    if (survey.responded_at) {
      return res.json({ success: true, data: survey, alreadyResponded: true })
    }
    res.json({ success: true, data: survey, alreadyResponded: false })
  } catch (err) {
    logger.error('CSAT get survey error:', err)
    res.status(500).json({ success: false, message: 'Failed to load survey' })
  }
})

router.post('/:token', async (req, res) => {
  try {
    const { rating, comment } = req.body
    const result = await submitResponse(req.params.token, { rating, comment })
    res.json({ success: true, data: result })
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message })
    }
    logger.error('CSAT submit error:', err)
    res.status(500).json({ success: false, message: 'Failed to submit response' })
  }
})

export default router
