import { describe, it, expect } from 'vitest'
import { diffLines, diffStats, diffToPlain, computeLcs } from '@/lib/wiki-diff'

describe('computeLcs', () => {
  it('builds DP table for identical lines', () => {
    const dp = computeLcs(['a', 'b'], ['a', 'b'])
    expect(dp[0][0]).toBe(2)
  })

  it('builds DP table for unrelated lines', () => {
    const dp = computeLcs(['a'], ['b'])
    expect(dp[0][0]).toBe(0)
  })
})

describe('diffLines', () => {
  it('marks unchanged lines as same', () => {
    const diff = diffLines('line1\nline2', 'line1\nline2')
    expect(diff).toEqual([
      { type: 'same', text: 'line1' },
      { type: 'same', text: 'line2' },
    ])
  })

  it('marks inserted lines as add', () => {
    const diff = diffLines('a', 'a\nb')
    expect(diff).toEqual([
      { type: 'same', text: 'a' },
      { type: 'add', text: 'b' },
    ])
  })

  it('marks removed lines as del', () => {
    const diff = diffLines('a\nb', 'a')
    expect(diff).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
    ])
  })

  it('mixes del/add for replaced content', () => {
    const diff = diffLines('old1\nold2', 'new1')
    expect(diff).toEqual([
      { type: 'add', text: 'new1' },
      { type: 'del', text: 'old1' },
      { type: 'del', text: 'old2' },
    ])
  })

  it('handles empty strings', () => {
    expect(diffLines('', '')).toEqual([])
    expect(diffLines('', 'x')).toEqual([{ type: 'add', text: 'x' }])
    expect(diffLines('x', '')).toEqual([{ type: 'del', text: 'x' }])
  })

  it('computes LCS diff (середина совпадает)', () => {
    // «a c» vs «b c d»: общий суффикс c, добавлены b, d
    const diff = diffLines('a\nc', 'b\nc\nd')
    expect(diff.filter((l) => l.type === 'same').map((l) => l.text)).toEqual(['c'])
    expect(diff.filter((l) => l.type === 'add')).toHaveLength(2)
    expect(diff.filter((l) => l.type === 'del')).toHaveLength(1)
  })
})

describe('diffStats', () => {
  it('counts added and removed lines', () => {
    const diff = diffLines('a\nb', 'x\na')
    expect(diffStats(diff)).toEqual({ added: 1, removed: 1 })
  })
})

describe('diffToPlain', () => {
  it('renders +/- markers', () => {
    expect(
      diffToPlain([
        { type: 'add', text: 'x' },
        { type: 'del', text: 'y' },
      ]),
    ).toBe('+ x\n- y')
  })
})
