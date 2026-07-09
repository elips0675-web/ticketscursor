import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
})

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(100),
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 chars'),
  department: z.string().optional(),
  title: z.string().optional(),
})

export const createTicketSchema = z.object({
  title: z.string().trim().min(1, 'Title required').max(200),
  description: z.string().trim().min(1, 'Description required'),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string().trim().min(1, 'Category required'),
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
