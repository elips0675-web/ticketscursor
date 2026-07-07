import { body, param, query, validationResult } from 'express-validator'

export function handleErrors(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation error', errors: errors.array() })
  }
  next()
}

export const loginValidation = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 1 }).withMessage('Password required'),
  handleErrors,
]

export const registerValidation = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name required (1-100 chars)'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 chars'),
  handleErrors,
]

export const createTicketValidation = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title required (1-200 chars)'),
  body('description').trim().isLength({ min: 1 }).withMessage('Description required'),
  body('priority').isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority'),
  body('category').trim().isLength({ min: 1 }).withMessage('Category required'),
  handleErrors,
]

export const updateStatusValidation = [
  param('id').isInt().withMessage('Invalid ticket ID'),
  body('status').isIn(['open', 'in_progress', 'resolved', 'closed']).withMessage('Invalid status'),
  handleErrors,
]

export const updatePriorityValidation = [
  param('id').isInt().withMessage('Invalid ticket ID'),
  body('priority').isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority'),
  handleErrors,
]

export const assignTicketValidation = [
  param('id').isInt().withMessage('Invalid ticket ID'),
  body('employeeId').isInt().withMessage('Invalid employee ID'),
  handleErrors,
]

export const addMessageValidation = [
  param('id').isInt().withMessage('Invalid ticket ID'),
  body('text').trim().isLength({ min: 1 }).withMessage('Message text required'),
  handleErrors,
]

export const createPollValidation = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title required'),
  body('options').isArray({ min: 2 }).withMessage('At least 2 options required'),
  handleErrors,
]

export const voteValidation = [
  param('id').isInt().withMessage('Invalid poll ID'),
  body('optionId').isInt({ min: 0 }).withMessage('Option ID required'),
  handleErrors,
]

export const deleteEventValidation = [
  param('id').isInt().withMessage('Invalid event ID'),
  handleErrors,
]

export const searchValidation = [
  query('q').trim().isLength({ min: 1 }).withMessage('Search query required'),
  handleErrors,
]

export const createNewsValidation = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title required'),
  body('content').trim().isLength({ min: 1 }).withMessage('Content required'),
  handleErrors,
]

export const createWikiValidation = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title required'),
  body('content').trim().isLength({ min: 1 }).withMessage('Content required'),
  handleErrors,
]

export const createCalendarValidation = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title required'),
  body('date').isISO8601().withMessage('Valid date required'),
  handleErrors,
]
