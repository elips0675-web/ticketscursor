import { prepareTestDatabase, teardownTestDatabase } from './test-db-setup.js'

// VAPID-ключи для тестов — валидная пара, чтобы роуты push не падали с 500.
process.env.VAPID_PUBLIC_KEY ||= 'BKvM9b1p0vP3Q8j5tL7mW9nC4rX6yZ2aB8dE0gI3kO5sU7wY1cF4hJ6lN8pR2tV'
process.env.VAPID_PRIVATE_KEY ||= 'z9x8c7v6b5n4m3l2k1j0h9g8f7d6s5a4'

export async function setup() {
  const { url } = await prepareTestDatabase()
  process.env.DATABASE_URL = url
  process.env.DIRECT_DATABASE_URL = url
  process.env.DB_NAME = process.env.TEST_DB_NAME || 'servicedesk_test'
  process.env.NODE_ENV = 'test'
}

export async function teardown() {
  await teardownTestDatabase()
}