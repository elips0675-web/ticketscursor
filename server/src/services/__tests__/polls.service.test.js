import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../prisma.js', () => ({
  default: {
    polls: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    poll_votes: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn() },
    poll_options: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { listPolls, createPoll, votePoll, deletePoll } from '../polls.service.js'
import prisma from '../../prisma.js'

beforeEach(() => { vi.clearAllMocks() })

describe('listPolls', () => {
  const basePoll = { id: 1, title: 'Test', description: 'desc', multiple_choice: false, ends_at: null, show_results: 'after_vote', created_by: 1, created_at: new Date() }

  it('returns empty list when no polls exist', async () => {
    prisma.polls.count.mockResolvedValue(0)
    prisma.polls.findMany.mockResolvedValue([])
    const result = await listPolls({ page: 1, limit: 10, status: 'all', userId: 1 })
    expect(result.data).toEqual([])
    expect(result.total).toBe(0)
  })

  it('filters by active status', async () => {
    prisma.polls.count.mockResolvedValue(1)
    prisma.polls.findMany.mockResolvedValue([basePoll])
    prisma.poll_votes.findMany.mockResolvedValue([])
    prisma.poll_options.findMany.mockResolvedValue([])
    await listPolls({ page: 1, limit: 10, status: 'active', userId: 1 })
    expect(prisma.polls.count).toHaveBeenCalledWith({ where: { ends_at: { gte: expect.any(Date) } } })
  })

  it('filters by closed status', async () => {
    prisma.polls.count.mockResolvedValue(1)
    prisma.polls.findMany.mockResolvedValue([basePoll])
    prisma.poll_votes.findMany.mockResolvedValue([])
    prisma.poll_options.findMany.mockResolvedValue([])
    await listPolls({ page: 1, limit: 10, status: 'closed', userId: 1 })
    expect(prisma.polls.count).toHaveBeenCalledWith({ where: { ends_at: { lt: expect.any(Date) } } })
  })

  it('maps poll options with voted/unvoted state', async () => {
    const poll = { ...basePoll, id: 2, multiple_choice: true }
    prisma.polls.count.mockResolvedValue(1)
    prisma.polls.findMany.mockResolvedValue([poll])
    prisma.poll_votes.findMany.mockResolvedValue([{ poll_id: 2, option_id: 10 }])
    prisma.poll_options.findMany.mockResolvedValue([
      { id: 10, poll_id: 2, text: 'Option A', votes_count: 5 },
      { id: 11, poll_id: 2, text: 'Option B', votes_count: 3 },
    ])
    const result = await listPolls({ page: 1, limit: 10, status: 'all', userId: 1 })
    expect(result.data[0].options).toHaveLength(2)
    expect(result.data[0].options[0].voted).toBe(true)
    expect(result.data[0].options[1].voted).toBe(false)
    expect(result.data[0].totalVotes).toBe(8)
  })
})

describe('createPoll', () => {
  it('creates poll with options', async () => {
    const createdPoll = {
      id: 1, title: 'New Poll', description: '', multiple_choice: false, ends_at: null,
      created_by: 1, show_results: 'after_vote',
      poll_options: [
        { id: 1, poll_id: 1, text: 'Yes', votes_count: 0 },
        { id: 2, poll_id: 1, text: 'No', votes_count: 0 },
      ],
    }
    prisma.polls.create.mockResolvedValue(createdPoll)
    prisma.polls.findUnique.mockResolvedValue({ id: 1, title: 'New Poll', description: '', multiple_choice: false, ends_at: null, created_by: 1, show_results: 'after_vote' })
    const result = await createPoll({ title: 'New Poll', description: '', options: ['Yes', 'No'], multipleChoice: false, showResults: 'after_vote', endsAt: null, userId: 1 })
    expect(result.id).toBe(1)
    expect(result.options).toHaveLength(2)
    expect(result.totalVotes).toBe(0)
  })
})

describe('votePoll', () => {
  it('returns error for non-existent poll', async () => {
    prisma.polls.findUnique.mockResolvedValue(null)
    const result = await votePoll(999, 1, 1)
    expect(result.error).toBe('Not found')
  })

  it('returns error for closed poll', async () => {
    prisma.polls.findUnique.mockResolvedValue({ id: 1, multiple_choice: false, ends_at: new Date('2020-01-01') })
    const result = await votePoll(1, 1, 1)
    expect(result.error).toBe('Poll is closed')
  })

  it('handles single-choice vote', async () => {
    prisma.polls.findUnique.mockResolvedValue({ id: 1, multiple_choice: false, ends_at: new Date(Date.now() + 86400000) })
    prisma.$transaction.mockImplementation(async (cb) => {
      const mockTx = {
        poll_votes: { deleteMany: vi.fn().mockResolvedValue({}), findMany: vi.fn(), groupBy: vi.fn().mockResolvedValue([{ option_id: 1, _count: { id: 5 } }]) },
        poll_options: { updateMany: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      }
      mockTx.poll_votes.create = vi.fn().mockResolvedValue({ id: 1 })
      return cb(mockTx)
    })
    prisma.poll_options.findMany.mockResolvedValue([{ id: 1, poll_id: 1, text: 'A', votes_count: 5 }])
    prisma.poll_votes.findMany.mockResolvedValue([{ option_id: 1 }])
    prisma.polls.findUnique.mockResolvedValue({ id: 1, multiple_choice: false, ends_at: null, show_results: 'after_vote' })
    const result = await votePoll(1, 1, 1)
    expect(result.id).toBe(1)
  })

  it('handles multiple-choice: toggles existing vote (delete)', async () => {
    prisma.polls.findUnique.mockResolvedValue({ id: 1, multiple_choice: true, ends_at: new Date(Date.now() + 86400000) })
    prisma.$transaction.mockImplementation(async (cb) => {
      const mockTx = {
        poll_votes: {
          findFirst: vi.fn().mockResolvedValue({ id: 10, poll_id: 1, option_id: 1, user_id: 1 }),
          delete: vi.fn().mockResolvedValue({}),
          groupBy: vi.fn().mockResolvedValue([{ option_id: 1, _count: { id: 4 } }]),
        },
        poll_options: { updateMany: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      }
      return cb(mockTx)
    })
    prisma.poll_options.findMany.mockResolvedValue([{ id: 1, poll_id: 1, text: 'A', votes_count: 4 }])
    prisma.poll_votes.findMany.mockResolvedValue([])
    prisma.polls.findUnique.mockResolvedValue({ id: 1, multiple_choice: true, ends_at: null, show_results: 'after_vote' })
    const result = await votePoll(1, 1, 1)
    expect(result.id).toBe(1)
  })

  it('handles multiple-choice: adds new vote (create)', async () => {
    prisma.polls.findUnique.mockResolvedValue({ id: 1, multiple_choice: true, ends_at: new Date(Date.now() + 86400000) })
    prisma.$transaction.mockImplementation(async (cb) => {
      const mockTx = {
        poll_votes: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 20 }),
          groupBy: vi.fn().mockResolvedValue([{ option_id: 1, _count: { id: 6 } }]),
        },
        poll_options: { updateMany: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      }
      return cb(mockTx)
    })
    prisma.poll_options.findMany.mockResolvedValue([{ id: 1, poll_id: 1, text: 'A', votes_count: 6 }])
    prisma.poll_votes.findMany.mockResolvedValue([{ option_id: 1 }])
    prisma.polls.findUnique.mockResolvedValue({ id: 1, multiple_choice: true, ends_at: null, show_results: 'after_vote' })
    const result = await votePoll(1, 1, 1)
    expect(result.id).toBe(1)
  })
})

describe('deletePoll', () => {
  it('deletes poll by id', async () => {
    prisma.polls.delete.mockResolvedValue({})
    await deletePoll(1)
    expect(prisma.polls.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})
