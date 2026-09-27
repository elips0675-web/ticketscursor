// Этап 68: index.js — 0% → тест стартапа, миграций, graceful shutdown.
// Все внешние зависимости замоканы; проверяем оркестрацию, а не реальное подключение.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

vi.mock('dotenv/config', () => ({}))

const migrator = vi.hoisted(() => ({
  migrate: { latest: vi.fn().mockResolvedValue([]) },
  destroy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('knex', () => ({ default: vi.fn(() => migrator) }))
vi.mock('../knexfile.js', () => ({ default: { client: 'mysql2' } }))

const appMock = vi.hoisted(() => ({
  server: { listen: vi.fn(), close: vi.fn() },
}))

const socketMock = vi.hoisted(() => ({
  setupSocket: vi.fn(),
  io: { close: vi.fn() },
  getIO: vi.fn(() => socketMock.io),
}))

const telegramMock = vi.hoisted(() => ({ initTelegram: vi.fn() }))
const backgroundMock = vi.hoisted(() => ({ setupBackgroundJobs: vi.fn(), stopBackgroundJobs: vi.fn() }))
const outboxMock = vi.hoisted(() => ({ startOutboxWorker: vi.fn(), stopOutboxWorker: vi.fn() }))
const searchSyncMock = vi.hoisted(() => ({ initSearchSync: vi.fn(), reindexAll: vi.fn() }))
const prismaMock = vi.hoisted(() => ({ $disconnect: vi.fn().mockResolvedValue(undefined) }))
const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }))

vi.mock('../app.js', () => ({ server: appMock.server }))
vi.mock('../socket.js', () => ({ setupSocket: socketMock.setupSocket, getIO: socketMock.getIO }))
vi.mock('../telegram.js', () => ({ initTelegram: telegramMock.initTelegram }))
vi.mock('../background.js', () => ({
  setupBackgroundJobs: backgroundMock.setupBackgroundJobs,
  stopBackgroundJobs: backgroundMock.stopBackgroundJobs,
}))
vi.mock('../outbox-worker.js', () => ({
  startOutboxWorker: outboxMock.startOutboxWorker,
  stopOutboxWorker: outboxMock.stopOutboxWorker,
}))
vi.mock('../search-sync.js', () => ({
  initSearchSync: searchSyncMock.initSearchSync,
  reindexAll: searchSyncMock.reindexAll,
}))
vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('../logger.js', () => ({ default: loggerMock }))

describe('index.js — старт и graceful shutdown (Этап 68)', () => {
  let exitSpy
  let sigtermHandler

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-12345'
    await import('../index.js')
    const calls = process.listeners('SIGTERM')
    sigtermHandler = calls[calls.length - 1]
  })

  afterAll(() => {
    exitSpy?.mockRestore()
  })

  it('стартует: setupSocket + initTelegram + initSearchSync', () => {
    expect(socketMock.setupSocket).toHaveBeenCalledWith(appMock.server)
    expect(telegramMock.initTelegram).toHaveBeenCalled()
    expect(searchSyncMock.initSearchSync).toHaveBeenCalled()
  })

  it('запускает фоновые задачи и outbox-воркер', () => {
    expect(backgroundMock.setupBackgroundJobs).toHaveBeenCalledWith(prismaMock)
    expect(outboxMock.startOutboxWorker).toHaveBeenCalledWith(socketMock.getIO)
  })

  it('server.listen вызывается с портом по умолчанию 4000', () => {
    expect(appMock.server.listen).toHaveBeenCalledWith(4000, expect.any(Function))
  })

  it('миграции прогоняются при старте', async () => {
    await vi.waitFor(() => {
      expect(migrator.migrate.latest).toHaveBeenCalled()
    })
    await vi.waitFor(() => {
      expect(migrator.destroy).toHaveBeenCalled()
    })
  })

  it('graceful shutdown останавливает всё и закрывает server/io/prisma', async () => {
    vi.clearAllMocks()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})

    sigtermHandler()

    await vi.waitFor(() => expect(backgroundMock.stopBackgroundJobs).toHaveBeenCalled())
    await vi.waitFor(() => expect(outboxMock.stopOutboxWorker).toHaveBeenCalled())
    await vi.waitFor(() => expect(appMock.server.close).toHaveBeenCalled())
    await vi.waitFor(() => expect(socketMock.getIO).toHaveBeenCalled())
    await vi.waitFor(() => expect(prismaMock.$disconnect).toHaveBeenCalled())
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0))
    expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('SIGTERM'))
  })
})