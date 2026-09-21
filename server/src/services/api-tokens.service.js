import crypto from 'crypto'
import prisma from '../prisma.js'

const TOKEN_BYTES = 32
const TOKEN_PREFIX = 'sd_'

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function generateToken() {
  const raw = TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString('hex')
  return raw
}

export async function createToken(userId, name, scopes, expiresAt) {
  const raw = generateToken()
  const tokenHash = hashToken(raw)
  const prefix = raw.slice(0, 12)

  const token = await prisma.api_tokens.create({
    data: {
      user_id: userId,
      name,
      token_hash: tokenHash,
      prefix,
      scopes: scopes || null,
      expires_at: expiresAt || null,
    },
  })

  return { ...token, raw }
}

export async function validateToken(raw) {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null

  const tokenHash = hashToken(raw)
  const token = await prisma.api_tokens.findFirst({
    where: {
      token_hash: tokenHash,
      deleted_at: null,
      OR: [
        { expires_at: null },
        { expires_at: { gt: new Date() } },
      ],
    },
    include: { employee: { select: { id: true, name: true, email: true, role: true, is_active: true } } },
  })

  if (!token || !token.employee?.is_active) return null

  await prisma.api_tokens.update({
    where: { id: token.id },
    data: { last_used: new Date() },
  }).catch(() => {})

  return {
    userId: token.user_id,
    name: token.employee.name,
    email: token.employee.email,
    role: token.employee.role,
    tokenId: token.id,
    scopes: token.scopes ? token.scopes.split(',') : [],
  }
}

export async function listTokens(userId) {
  return prisma.api_tokens.findMany({
    where: { user_id: userId, deleted_at: null },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      expires_at: true,
      last_used: true,
      created_at: true,
    },
    orderBy: { created_at: 'desc' },
  })
}

export async function deleteToken(id, userId) {
  const token = await prisma.api_tokens.findFirst({
    where: { id, deleted_at: null },
    select: { user_id: true },
  })
  if (!token) return null
  if (token.user_id !== userId) return 'forbidden'
  await prisma.api_tokens.update({
    where: { id },
    data: { deleted_at: new Date() },
  })
  return true
}
