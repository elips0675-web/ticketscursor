import { describe, it, expect } from 'vitest'
import { hasRole, ROLE_HIERARCHY } from '../../utils/roleUtils.js'

describe('roleUtils', () => {
  it('has correct hierarchy order', () => {
    expect(ROLE_HIERARCHY).toEqual(['requester', 'agent', 'senior_agent', 'admin', 'super_admin'])
  })

  it('super_admin passes all role checks', () => {
    expect(hasRole('super_admin', 'super_admin')).toBe(true)
    expect(hasRole('super_admin', 'admin')).toBe(true)
    expect(hasRole('super_admin', 'senior_agent')).toBe(true)
    expect(hasRole('super_admin', 'agent')).toBe(true)
    expect(hasRole('super_admin', 'requester')).toBe(true)
  })

  it('admin passes admin and below checks', () => {
    expect(hasRole('admin', 'admin')).toBe(true)
    expect(hasRole('admin', 'senior_agent')).toBe(true)
    expect(hasRole('admin', 'agent')).toBe(true)
    expect(hasRole('admin', 'requester')).toBe(true)
    expect(hasRole('admin', 'super_admin')).toBe(false)
  })

  it('agent passes only agent and requester checks', () => {
    expect(hasRole('agent', 'agent')).toBe(true)
    expect(hasRole('agent', 'requester')).toBe(true)
    expect(hasRole('agent', 'senior_agent')).toBe(false)
    expect(hasRole('agent', 'admin')).toBe(false)
  })

  it('requester passes only requester check', () => {
    expect(hasRole('requester', 'requester')).toBe(true)
    expect(hasRole('requester', 'agent')).toBe(false)
    expect(hasRole('requester', 'senior_agent')).toBe(false)
  })

  it('returns false for unknown roles', () => {
    expect(hasRole('unknown', 'admin')).toBe(false)
    expect(hasRole('admin', 'unknown')).toBe(false)
    expect(hasRole('unknown', 'unknown')).toBe(false)
  })

  it('returns false for empty roles', () => {
    expect(hasRole('', 'admin')).toBe(false)
    expect(hasRole('admin', '')).toBe(false)
  })
})
