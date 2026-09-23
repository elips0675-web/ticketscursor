import { Issuer, generators } from 'openid-client'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import prisma from '../prisma.js'
import { JWT_SECRET } from '../middleware.js'
import logger from '../logger.js'

const REFRESH_SECRET = process.env.REFRESH_SECRET || process.env.JWT_SECRET + '-refresh'
const SSO_STATE_SECRET = process.env.SSO_STATE_SECRET || 'sso-state-secret-change-in-production'

let oidcClient = null
let ssoConfig = null

export async function getSSOConfig() {
  const rows = await prisma.admin_settings.findMany({
    where: { key: { startsWith: 'SSO_' } },
    select: { key: true, value: true },
  })
  const config = {}
  for (const r of rows) config[r.key] = r.value
  return config
}

export async function isSSOEnabled() {
  const config = await getSSOConfig()
  return !!(config.SSO_ENABLED === 'true' && config.SSO_ISSUER_URL && config.SSO_CLIENT_ID && config.SSO_CLIENT_SECRET)
}

export async function initOIDCClient() {
  const config = await getSSOConfig()
  if (!config.SSO_ISSUER_URL || !config.SSO_CLIENT_ID || !config.SSO_CLIENT_SECRET) {
    return null
  }

  try {
    const issuer = await Issuer.discover(config.SSO_ISSUER_URL)
    oidcClient = new issuer.Client({
      client_id: config.SSO_CLIENT_ID,
      client_secret: config.SSO_CLIENT_SECRET,
      redirect_uris: [config.SSO_REDIRECT_URI || 'http://localhost:5173/auth/sso/callback'],
      response_types: ['code'],
    })
    ssoConfig = config
    logger.info('OIDC client initialized for issuer:', config.SSO_ISSUER_URL)
    return oidcClient
  } catch (err) {
    logger.error('Failed to initialize OIDC client:', err.message)
    return null
  }
}

export function generateSSOState() {
  return generators.state()
}

export function generateSSONonce() {
  return generators.nonce()
}

export async function getSSOAuthorizationUrl(state, nonce) {
  if (!oidcClient) {
    await initOIDCClient()
  }
  if (!oidcClient) return null

  return oidcClient.authorizationUrl({
    scope: 'openid email profile',
    state,
    nonce,
  })
}

export async function handleSSOCallback(code, state, nonce) {
  if (!oidcClient) {
    await initOIDCClient()
  }
  if (!oidcClient) throw new Error('SSO not configured')

  const tokenSet = await oidcClient.callback(
    ssoConfig?.SSO_REDIRECT_URI || 'http://localhost:5173/auth/sso/callback',
    { code, state },
    { nonce },
  )

  const claims = tokenSet.claims()
  const email = claims.email
  const name = claims.name || claims.preferred_username || email?.split('@')[0] || 'SSO User'

  if (!email) throw new Error('No email in SSO claims')

  let employee = await prisma.employees.findFirst({
    where: { email },
    select: { id: true, email: true, name: true, role: true, is_active: true },
  })

  if (!employee) {
    const config = ssoConfig || await getSSOConfig()
    const defaultRole = config.SSO_DEFAULT_ROLE || 'agent'
    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)

    employee = await prisma.employees.create({
      data: {
        name,
        email,
        password_hash: randomPassword,
        role: defaultRole,
        department: '',
        title: 'SSO User',
        is_active: true,
      },
    })
    logger.info(`SSO auto-provisioned user: ${email} (role: ${defaultRole})`)
  } else if (!employee.is_active) {
    throw new Error('Account is disabled')
  }

  const accessToken = jwt.sign(
    { userId: employee.id, role: employee.role },
    JWT_SECRET,
    { expiresIn: '15m' },
  )
  const refreshToken = jwt.sign(
    { userId: employee.id, tokenId: crypto.randomUUID() },
    REFRESH_SECRET,
    { expiresIn: '7d' },
  )

  await prisma.refresh_tokens.create({
    data: {
      user_id: employee.id,
      token: refreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  return {
    accessToken,
    refreshToken,
    employee: { id: employee.id, name: employee.name, email: employee.email, role: employee.role },
  }
}
