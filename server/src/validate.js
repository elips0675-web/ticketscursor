import {
  loginSchema, registerSchema, createTicketSchema,
  updateStatusSchema, updatePrioritySchema, assignTicketSchema,
  addMessageSchema, createPollSchema, voteSchema,
  createNewsSchema, createWikiSchema, createCalendarSchema,
  updateCalendarSchema, searchSchema, changePasswordSchema,
  idParamSchema,
} from './schemas.js'

export function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body || {})
      next()
    } catch (err) {
      if (err && err.issues) {
        return res.status(400).json({
          message: 'Validation error',
          errors: err.issues.map(e => ({ field: e.path.join('.'), message: e.message })),
        })
      }
      next(err)
    }
  }
}

export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query)
      next()
    } catch (err) {
      if (err && err.issues) {
        return res.status(400).json({
          message: 'Validation error',
          errors: err.issues.map(e => ({ field: e.path.join('.'), message: e.message })),
        })
      }
      next(err)
    }
  }
}

export const loginValidation = validate(loginSchema)
export const registerValidation = validate(registerSchema)
export const createTicketValidation = validate(createTicketSchema)
export const updateStatusValidation = validate(updateStatusSchema)
export const updatePriorityValidation = validate(updatePrioritySchema)
export const assignTicketValidation = validate(assignTicketSchema)
export const addMessageValidation = validate(addMessageSchema)
export const createPollValidation = validate(createPollSchema)
export const voteValidation = validate(voteSchema)
export const createNewsValidation = validate(createNewsSchema)
export const createWikiValidation = validate(createWikiSchema)
export const createCalendarValidation = validate(createCalendarSchema)
export const updateCalendarValidation = validate(updateCalendarSchema)
export const searchValidation = validateQuery(searchSchema)
export const changePasswordValidation = validate(changePasswordSchema)

export function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.params = schema.parse(req.params)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          message: 'Validation error',
          errors: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
        })
      }
      next(err)
    }
  }
}

export const deleteEventValidation = validateParams(idParamSchema)
