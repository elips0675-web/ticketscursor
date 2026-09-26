import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email({ message: 'Valid email required' }),
  password: z.string().min(1, 'Password required'),
})

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(100),
  email: z.string().email({ message: 'Valid email required' }),
  password: z.string().min(6, 'Password must be at least 6 chars'),
  department: z.string().optional(),
  title: z.string().optional(),
})

export const createTicketSchema = z.object({
  title: z.string().trim().min(1, 'Title required').max(200),
  description: z.string().trim().min(1, 'Description required'),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string().trim().min(1, 'Category required'),
  tags: z.array(z.string().trim().min(1, 'Tag required').max(50)).max(20).optional(),
})

export const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
})

export const updatePrioritySchema = z.object({
  priority: z.enum(['low', 'medium', 'high', 'critical']),
})

export const assignTicketSchema = z.object({
  employeeId: z.number().int().nullable(),
})

export const updateTagsSchema = z.object({
  tags: z.array(z.string().trim().min(1, 'Tag required').max(50)).max(20),
})

export const bulkTicketSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1, 'At least one ticket id required').max(100),
    action: z.enum(['status', 'assign', 'priority']),
    status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'reopened']).optional(),
    employeeId: z.number().int().positive().nullable().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  })
  .refine(
    (data) => {
      if (data.action === 'status') return data.status !== undefined
      if (data.action === 'assign') return data.employeeId !== undefined
      if (data.action === 'priority') return data.priority !== undefined
      return false
    },
    { message: 'Missing required field for this action' },
  )

export const addMessageSchema = z.object({
  text: z.string().trim().min(1, 'Message text required'),
  isInternal: z.boolean().optional(),
  attachments: z.string().optional(),
})

export const createPollSchema = z.object({
  title: z.string().trim().min(1, 'Title required').max(200),
  description: z.string().optional(),
  options: z.array(z.string()).min(2, 'At least 2 options required'),
  multipleChoice: z.boolean().optional(),
})

export const voteSchema = z.object({
  optionId: z.number().int().min(0, 'Option ID required'),
})

export const createNewsSchema = z.object({
  title: z.string().trim().min(1, 'Title required').max(200),
  content: z.string().trim().min(1, 'Content required'),
  important: z.boolean().optional(),
})

export const createWikiSchema = z.object({
  title: z.string().trim().min(1, 'Title required').max(200),
  content: z.string().trim().min(1, 'Content required'),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export const createCalendarSchema = z.object({
  title: z.string().trim().min(1, 'Title required').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date required (YYYY-MM-DD)'),
  time: z.string().optional(),
  description: z.string().optional(),
})

export const updateCalendarSchema = z.object({
  title: z.string().trim().min(1, 'Title required').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date required (YYYY-MM-DD)'),
  time: z.string().optional(),
  description: z.string().optional(),
})

export const searchSchema = z.object({
  q: z.string().trim().min(1, 'Search query required'),
})

export const changePasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
})

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const addTimeSchema = z.object({
  minutes: z.coerce.number().int().min(1, 'Minutes required (min 1)').max(1440),
  description: z.string().trim().max(500, 'Description too long').optional().default(''),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date required (YYYY-MM-DD)').optional(),
})

// Этап 64: watcher / relations / merge
export const addWatcherSchema = z.object({
  employeeId: z.number().int().positive(),
})

export const addRelationSchema = z.object({
  relatedTicketId: z.number().int().positive(),
  type: z.enum(['parent', 'child', 'blocked_by', 'duplicate', 'related']),
})

export const mergeTicketSchema = z.object({
  targetTicketId: z.number().int().positive(),
})
