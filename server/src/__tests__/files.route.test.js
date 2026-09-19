import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = {
  files: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: 1, name: 'test.pdf', size: '1.2 MB', type: 'pdf', folder_id: null, path: '/uploads/files/test.pdf', created_at: new Date() }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  file_folders: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1, name: 'Docs', user_id: 1 }),
  },
}

vi.mock('../prisma.js', () => ({ default: prismaMock }))
vi.mock('../logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../audit.js', () => ({ auditLogMiddleware: (_req, _res, next) => next() }))
vi.mock('../middleware.js', () => ({
  authenticateToken: (req, _res, next) => { req.user = { userId: 1, role: 'admin' }; next() },
  requireRole: () => (_req, _res, next) => next(),
}))
vi.mock('../storage.js', () => ({
  saveFile: vi.fn().mockResolvedValue({ url: '/uploads/files/saved.pdf' }),
}))
vi.mock('../services/files.service.js', () => ({
  getFolders: vi.fn().mockResolvedValue({ folders: [], total: 0 }),
  createFolder: vi.fn().mockResolvedValue({ id: 1, name: 'New Folder' }),
  createFile: vi.fn().mockResolvedValue({ id: 1, name: 'upload.pdf', size: '1.2 MB', type: 'pdf', folder_id: null, path: '/uploads/files/upload.pdf', created_at: new Date() }),
  deleteFile: vi.fn().mockResolvedValue(true),
}))

describe('files route', () => {
  let router

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../routes/files.js')
    router = mod.default
  })

  function mockReqRes(overrides = {}) {
    const req = {
      user: { userId: 1, role: 'admin' },
      params: {},
      query: {},
      body: {},
      file: null,
      ...overrides,
    }
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    return { req, res }
  }

  function findHandler(method, path) {
    const stack = router.stack
    for (const layer of stack) {
      if (layer.route && layer.route.path === path && layer.route.methods[method]) {
        return layer.route.stack[layer.route.stack.length - 1].handle
      }
    }
    return null
  }

  describe('GET /folders', () => {
    it('returns folders list', async () => {
      const handler = findHandler('get', '/folders')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes()
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })
  })

  describe('POST /folders', () => {
    it('creates a folder', async () => {
      const handler = findHandler('post', '/folders')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ body: { name: 'New Folder' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 400 when name is missing', async () => {
      const handler = findHandler('post', '/folders')
      const { req, res } = mockReqRes({ body: {} })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('DELETE /:id', () => {
    it('deletes file when found', async () => {
      prismaMock.files.findUnique.mockResolvedValue({ id: 1 })
      const handler = findHandler('delete', '/:id')
      expect(handler).toBeTruthy()
      const { req, res } = mockReqRes({ params: { id: '1' } })
      await handler(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('returns 404 when file not found', async () => {
      prismaMock.files.findUnique.mockResolvedValue(null)
      const handler = findHandler('delete', '/:id')
      const { req, res } = mockReqRes({ params: { id: '999' } })
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })
  })
})
