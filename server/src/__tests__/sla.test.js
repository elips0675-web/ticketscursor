import { describe, it, expect } from 'vitest'
import { addBusinessHours, getRemainingBusinessMs, isWithinBusinessHours } from '../sla.js'

describe('addBusinessHours', () => {
  const DEFAULT_SETTINGS = {}

  it('adds hours within same workday', () => {
    const monday9am = new Date('2026-09-21T09:00:00')
    vi.setSystemTime(monday9am)
    const result = addBusinessHours(monday9am, 2, DEFAULT_SETTINGS)
    expect(result.getHours()).toBe(11)
    expect(result.getDay()).toBe(1)
  })

  it('skips weekends', () => {
    const friday4pm = new Date('2026-09-25T16:00:00')
    vi.setSystemTime(friday4pm)
    const result = addBusinessHours(friday4pm, 4, DEFAULT_SETTINGS)
    expect(result.getDay()).toBe(1)
    expect(result.getHours()).toBe(11)
  })

  it('skips to next workday if outside working hours', () => {
    const monday10pm = new Date('2026-09-21T22:00:00')
    vi.setSystemTime(monday10pm)
    const result = addBusinessHours(monday10pm, 2, DEFAULT_SETTINGS)
    expect(result.getDay()).toBe(2)
    expect(result.getHours()).toBe(11)
  })

  it('respects custom working hours', () => {
    const monday8am = new Date('2026-09-21T08:00:00')
    vi.setSystemTime(monday8am)
    const result = addBusinessHours(monday8am, 3, { BUSINESS_HOURS_START: '10', BUSINESS_HOURS_END: '20' })
    expect(result.getHours()).toBe(13)
  })

  it('handles 0 hours', () => {
    const monday9am = new Date('2026-09-21T09:00:00')
    vi.setSystemTime(monday9am)
    const result = addBusinessHours(monday9am, 0, DEFAULT_SETTINGS)
    expect(result.getTime()).toBe(monday9am.getTime())
  })
})

describe('getRemainingBusinessMs', () => {
  it('calculates remaining time within a workday', () => {
    const now = new Date('2026-09-21T10:00:00')
    const due = new Date('2026-09-21T12:00:00')
    const remaining = getRemainingBusinessMs(now, due, {})
    expect(remaining).toBe(2 * 60 * 60 * 1000)
  })

  it('skips weekends when calculating remaining', () => {
    const friday4pm = new Date('2026-09-25T16:00:00')
    const monday2pm = new Date('2026-09-28T14:00:00')
    const remaining = getRemainingBusinessMs(friday4pm, monday2pm, {})
    const expectedHours = 2 + 5
    expect(remaining).toBe(expectedHours * 60 * 60 * 1000)
  })
})

describe('isWithinBusinessHours', () => {
  it('returns true during workday working hours', () => {
    const monday10am = new Date('2026-09-21T10:00:00')
    expect(isWithinBusinessHours(monday10am, {})).toBe(true)
  })

  it('returns false on weekend', () => {
    const saturday = new Date('2026-09-26T10:00:00')
    expect(isWithinBusinessHours(saturday, {})).toBe(false)
  })

  it('returns false outside working hours', () => {
    const monday8am = new Date('2026-09-21T08:00:00')
    expect(isWithinBusinessHours(monday8am, {})).toBe(false)
  })

  it('returns false at end of working hours', () => {
    const monday6pm = new Date('2026-09-21T18:00:00')
    expect(isWithinBusinessHours(monday6pm, {})).toBe(false)
  })
})
