import { describe, it, expect } from 'vitest'
import { addBusinessHours, getRemainingBusinessMs, isWithinBusinessHours } from '../sla.js'

describe('SLA с TIMEZONE из настроек (P0-фикс)', () => {
  it('рабочий день определяется по таймзоне, а не по локальной (Asia/Vladivostok, UTC+10)', () => {
    // 2026-09-21T20:00Z = вторник 06:00 Владивостока — до начала рабочего дня
    const result = addBusinessHours(new Date('2026-09-21T20:00:00Z'), 2, { TIMEZONE: 'Asia/Vladivostok' })
    // 09:00 Владивостока = 23:00Z, +2ч → 11:00 Владивостока
    expect(result.toISOString()).toBe('2026-09-22T01:00:00.000Z')
  })

  it('DST-переход Europe/London (29.03.2026 GMT→BST) учитывается в дедлайне', () => {
    // пятница 16:00 GMT + 4ч = 2ч до конца дня, остаток 2ч в понедельник после перехода (BST)
    const result = addBusinessHours(new Date('2026-03-27T16:00:00Z'), 4, { TIMEZONE: 'Europe/London' })
    expect(result.toISOString()).toBe('2026-03-30T10:00:00.000Z') // 11:00 BST = 10:00Z
  })

  it('DST-переход America/New_York (08.03.2026 EST→EDT) учитывается', () => {
    // пятница 11:00 EST (16:00Z) + 8ч → 1ч в понедельник 09:00 EDT (13:00Z)
    const result = addBusinessHours(new Date('2026-03-06T16:00:00Z'), 8, { TIMEZONE: 'America/New_York' })
    expect(result.toISOString()).toBe('2026-03-09T14:00:00.000Z') // 10:00 EDT = 14:00Z
  })

  it('getRemainingBusinessMs считает в таймзоне', () => {
    const remaining = getRemainingBusinessMs(
      new Date('2026-09-21T00:00:00Z'), // 10:00 Владивостока
      new Date('2026-09-21T01:00:00Z'), // 11:00 Владивостока
      { TIMEZONE: 'Asia/Vladivostok' },
    )
    expect(remaining).toBe(60 * 60 * 1000)
  })

  it('getRemainingBusinessMs пропускает выходные таймзоны', () => {
    // пятница 18:00 Владивостока → понедельник 11:00 Владивостока = 2 рабочих часа (09:00–11:00)
    const remaining = getRemainingBusinessMs(
      new Date('2026-09-25T08:00:00Z'),
      new Date('2026-09-28T01:00:00Z'),
      { TIMEZONE: 'Asia/Vladivostok' },
    )
    expect(remaining).toBe(2 * 60 * 60 * 1000)
  })

  it('isWithinBusinessHours оценивает по таймзоне', () => {
    expect(isWithinBusinessHours(new Date('2026-09-21T00:30:00Z'), { TIMEZONE: 'Asia/Vladivostok' })).toBe(true) // 10:30 Влад
    expect(isWithinBusinessHours(new Date('2026-09-21T09:30:00Z'), { TIMEZONE: 'Asia/Vladivostok' })).toBe(false) // 19:30 Влад
    expect(isWithinBusinessHours(new Date('2026-09-20T01:00:00Z'), { TIMEZONE: 'Asia/Vladivostok' })).toBe(false) // воскресенье
  })

  it('невалидный TIMEZONE не роняет расчёт (fallback на локальное время)', () => {
    const monday9am = new Date('2026-09-21T09:00:00')
    const result = addBusinessHours(monday9am, 2, { TIMEZONE: 'Not/AZone' })
    expect(result.getHours()).toBe(11)
  })
})
