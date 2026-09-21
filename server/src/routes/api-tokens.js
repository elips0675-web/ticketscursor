import { Router } from 'express'
import { authenticateToken } from '../middleware.js'
import { createToken, listTokens, deleteToken } from '../services/api-tokens.service.js'

const router = Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const tokens = await listTokens(req.user.userId)
    res.json({ success: true, data: tokens })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list tokens' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, scopes, expires_at } = req.body
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Token name is required' })

    const result = await createToken(req.user.userId, name.trim(), scopes, expires_at)
    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        name: result.name,
        prefix: result.prefix,
        token: result.raw,
        scopes: result.scopes,
        expires_at: result.expires_at,
        created_at: result.created_at,
      },
      message: 'Save this token — it will not be shown again',
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create token' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteToken(Number(req.params.id), req.user.userId)
    if (result === null) return res.status(404).json({ success: false, message: 'Token not found' })
    if (result === 'forbidden') return res.status(403).json({ success: false, message: 'Cannot delete tokens of other users' })
    res.json({ success: true, message: 'Token deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete token' })
  }
})

export default router
