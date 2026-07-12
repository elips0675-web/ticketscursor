import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    file_folders: { findMany: vi.fn(), create: vi.fn() },
    files: { create: vi.fn(), delete: vi.fn(), count: vi.fn() },
  },
}))

import { getFolders, createFolder, createFile, deleteFile } from '../files.service.js'
import prisma from '../../prisma.js'

beforeEach(() => { vi.clearAllMocks() })

describe('getFolders', () => {
  it('returns folders with mapped files', async () => {
    prisma.file_folders.findMany.mockResolvedValue([
      { id: 1, name: 'Docs', user_id: 1, is_shared: false, files: [{ id: 1, name: 'readme.txt', size: 100, type: 'text', folder_id: 1, path: '/docs/readme.txt', created_at: new Date() }] },
    ])
    prisma.files.count.mockResolvedValue(1)
    const result = await getFolders(1, 1, 10)
    expect(result).toHaveLength(1)
    expect(result[0].files[0]).toHaveProperty('folderId')
    expect(result[0].files[0]).not.toHaveProperty('folder_id')
    expect(result[0].totalFiles).toBe(1)
  })

  it('returns empty array when no folders', async () => {
    prisma.file_folders.findMany.mockResolvedValue([])
    const result = await getFolders(1, 1, 10)
    expect(result).toEqual([])
  })
})

describe('createFolder', () => {
  it('creates folder for user', async () => {
    prisma.file_folders.create.mockResolvedValue({ id: 1, name: 'New Folder', user_id: 1 })
    const result = await createFolder('New Folder', 1)
    expect(result.name).toBe('New Folder')
  })
})

describe('createFile', () => {
  it('creates file with folder', async () => {
    prisma.files.create.mockResolvedValue({ id: 1, name: 'f.txt', size: 200, type: 'text', folder_id: 1, path: '/f.txt', user_id: 1 })
    const result = await createFile({ name: 'f.txt', size: 200, type: 'text', folderId: 1, path: '/f.txt', userId: 1 })
    expect(result.name).toBe('f.txt')
  })

  it('creates file without folder', async () => {
    prisma.files.create.mockResolvedValue({ id: 2, name: 'root.txt', size: 50, type: 'text', folder_id: null, path: '/root.txt', user_id: 1 })
    const result = await createFile({ name: 'root.txt', size: 50, type: 'text', folderId: null, path: '/root.txt', userId: 1 })
    expect(result.folder_id).toBeNull()
  })
})

describe('deleteFile', () => {
  it('deletes file by id', async () => {
    prisma.files.delete.mockResolvedValue({})
    await deleteFile(1)
    expect(prisma.files.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})
