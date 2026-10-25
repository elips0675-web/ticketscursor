import { describe, it, expect } from 'vitest'
import {
  ARCHIVE_AGE_DAYS,
  ARCHIVE_THRESHOLD,
  CANDIDATES_SQL,
  decideArchive,
  exitCodeFor,
  parseCount,
} from './messages-archive-measure.mjs'

describe('messages-archive-measure — правило архивации (CHW-09)', () => {
  it('порог и возраст совпадают с записью бэклога (100 тыс. строк / 90 дней)', () => {
    expect(ARCHIVE_THRESHOLD).toBe(100_000)
    expect(ARCHIVE_AGE_DAYS).toBe(90)
  })

  describe('decideArchive', () => {
    it('ниже порога — архивация не нужна', () => {
      const decision = decideArchive({ candidates: 99_999 })
      expect(decision.required).toBe(false)
      expect(decision.verdict).toBe('not-required')
    })

    it('ровно на пороге — уже нужна (≥, а не >)', () => {
      const decision = decideArchive({ candidates: 100_000 })
      expect(decision.required).toBe(true)
      expect(decision.verdict).toBe('required')
    })

    it('выше порога — нужна', () => {
      expect(decideArchive({ candidates: 150_000 }).required).toBe(true)
    })

    it('ноль сообщений — не нужна, а не ошибка', () => {
      expect(decideArchive({ candidates: 0 }).required).toBe(false)
    })

    it('порог можно передать явно', () => {
      expect(decideArchive({ candidates: 10, threshold: 5 }).required).toBe(true)
    })

    it('невалидный замер — исключение, а не «не требуется»', () => {
      expect(() => decideArchive({ candidates: Number.NaN })).toThrow()
      expect(() => decideArchive({ candidates: -1 })).toThrow()
      expect(() => decideArchive({ candidates: '42' })).toThrow()
      expect(() => decideArchive()).toThrow()
    })

    it('невалидный порог — исключение', () => {
      expect(() => decideArchive({ candidates: 1, threshold: 0 })).toThrow()
      expect(() => decideArchive({ candidates: 1, threshold: Number.NaN })).toThrow()
    })
  })

  describe('parseCount', () => {
    it('читает число из вывода mysql -N -B', () => {
      expect(parseCount('5\n')).toBe(5)
      expect(parseCount('  12  \n\n')).toBe(12)
      expect(parseCount('0')).toBe(0)
    })

    it('мусор в выводе — исключение, а не ноль', () => {
      expect(() => parseCount('abc')).toThrow()
      expect(() => parseCount('')).toThrow()
      expect(() => parseCount(undefined)).toThrow()
      expect(() => parseCount('ERROR 1045 (28000): Access denied')).toThrow()
    })
  })

  describe('CANDIDATES_SQL', () => {
    it('считает только закрытые/решённые тикеты и только старше 90 дней', () => {
      expect(CANDIDATES_SQL).toContain('FROM ticket_messages')
      expect(CANDIDATES_SQL).toContain("t.status IN ('closed', 'resolved')")
      expect(CANDIDATES_SQL).toContain('INTERVAL 90 DAY')
    })

    it('не считает все сообщения подряд (иначе замер завышен)', () => {
      expect(CANDIDATES_SQL).not.toMatch(/SELECT COUNT\(\*\) FROM ticket_messages\s*$/)
      expect(CANDIDATES_SQL).toContain('JOIN tickets')
    })
  })

  describe('exitCodeFor', () => {
    it('перейдённый порог — код 1 (сигнал «делать»), иначе 0', () => {
      expect(exitCodeFor({ required: true })).toBe(1)
      expect(exitCodeFor({ required: false })).toBe(0)
    })
  })
})
