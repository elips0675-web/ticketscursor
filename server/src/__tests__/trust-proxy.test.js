import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { getTrustProxySetting } from '../trust-proxy.js'

const SPOOF = '203.0.113.7'

function makeApp() {
  const app = express()
  app.set('trust proxy', getTrustProxySetting())
  app.get('/ip', (req, res) => res.json({ ip: req.ip }))
  return app
}

describe('trust proxy — XFF спуфинг-защита (дипсик P1/P2)', () => {
  const orig = process.env.TRUST_PROXY

  afterEach(() => {
    if (orig === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = orig
  })

  it('без TRUST_PROXY поддельный X-Forwarded-For игнорируется (req.ip = socket)', async () => {
    delete process.env.TRUST_PROXY
    expect(getTrustProxySetting()).toBe(false)
    const res = await request(makeApp()).get('/ip').set('X-Forwarded-For', SPOOF)
    expect(res.status).toBe(200)
    expect(res.body.ip).not.toBe(SPOOF)
  })

  it('TRUST_PROXY=1 — за nginx XFF доверяется', async () => {
    process.env.TRUST_PROXY = '1'
    expect(getTrustProxySetting()).toBe(1)
    const res = await request(makeApp()).get('/ip').set('X-Forwarded-For', SPOOF)
    expect(res.body.ip).toBe(SPOOF)
  })

  it('TRUST_PROXY=true — тоже доверяется', async () => {
    process.env.TRUST_PROXY = 'true'
    expect(getTrustProxySetting()).toBe(1)
    const res = await request(makeApp()).get('/ip').set('X-Forwarded-For', SPOOF)
    expect(res.body.ip).toBe(SPOOF)
  })

  it('невалидное значение — off (XFF не доверяем)', async () => {
    process.env.TRUST_PROXY = 'yes'
    expect(getTrustProxySetting()).toBe(false)
    const res = await request(makeApp()).get('/ip').set('X-Forwarded-For', SPOOF)
    expect(res.body.ip).not.toBe(SPOOF)
  })
})