import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createLimiters } from '../limits.js'
import { app } from '../app.js'

const ORIGINAL_NODE_ENV = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV
})

function stubApp(limiter) {
  const stub = express()
  stub.use(express.json())
  stub.get('/ping', limiter, (req, res) => res.json({ ok: true }))
  return stub
}

async function hit(app, times) {
  let last
  for (let i = 0; i < times; i += 1) {
    last = await request(app).get('/ping')
  }
  return last
}

describe('rate limiters (createLimiters)', () => {
  it('authLimiter allows requests up to the max (10)', async () => {
    const { authLimiter } = createLimiters(() => false)
    const last = await hit(stubApp(authLimiter), 10)
    expect(last.status).toBe(200)
  })

  it('authLimiter blocks the 11th request with 429', async () => {
    const { authLimiter } = createLimiters(() => false)
    const last = await hit(stubApp(authLimiter), 11)
    expect(last.status).toBe(429)
    expect(last.body.message).toBe('Too many auth requests')
  })

  it('apiLimiter blocks the 101st request with 429', async () => {
    const { apiLimiter } = createLimiters(() => false)
    const last = await hit(stubApp(apiLimiter), 101)
    expect(last.status).toBe(429)
    expect(last.body.message).toBe('Too many requests')
  })

  it('adminLimiter blocks the 31st request with 429', async () => {
    const { adminLimiter } = createLimiters(() => false)
    const last = await hit(stubApp(adminLimiter), 31)
    expect(last.status).toBe(429)
    expect(last.body.message).toBe('Too many admin requests')
  })

  it('keeps independent counters for separate limiter instances', async () => {
    const { authLimiter, apiLimiter } = createLimiters(() => false)
    const authApp = stubApp(authLimiter)
    const apiApp = stubApp(apiLimiter)
    for (let i = 0; i < 10; i += 1) {
      expect((await request(authApp).get('/ping')).status).toBe(200)
    }
    expect((await request(apiApp).get('/ping')).status).toBe(200)
    expect((await request(authApp).get('/ping')).status).toBe(429)
    expect((await request(apiApp).get('/ping')).status).toBe(200)
  })

  it('default skip is enabled in test env (no blocking)', async () => {
    const { authLimiter } = createLimiters()
    const last = await hit(stubApp(authLimiter), 15)
    expect(last.status).toBe(200)
  })
})

describe('real app wiring', () => {
  it('dev-login is disabled in production (404)', async () => {
    process.env.NODE_ENV = 'production'
    const res = await request(app).post('/api/auth/dev-login')
    expect(res.status).toBe(404)
  })

  it('dev-login is behind the auth limiter (429 after exceeding 10/min)', async () => {
    process.env.NODE_ENV = 'development'
    let last
    for (let i = 0; i < 15; i += 1) {
      last = await request(app).post('/api/auth/dev-login')
    }
    expect(last.status).toBe(429)
    expect(last.body.message).toBe('Too many auth requests')
  })

  it('admin routes are behind the admin limiter (429 after exceeding 30/min)', async () => {
    process.env.NODE_ENV = 'development'
    let last
    for (let i = 0; i < 35; i += 1) {
      last = await request(app).get('/api/rules')
    }
    expect(last.status).toBe(429)
    expect(last.body.message).toBe('Too many admin requests')
  })

  it('api routes are behind the api limiter (429 after exceeding 100/min)', async () => {
    process.env.NODE_ENV = 'development'
    let last
    for (let i = 0; i < 110; i += 1) {
      last = await request(app).get('/api/news')
    }
    expect(last.status).toBe(429)
    expect(last.body.message).toBe('Too many requests')
  })
})