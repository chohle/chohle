import { describe, expect, it } from 'vitest'
import { computePayout } from '../server/utils/payout'

// Luzern, paid on the 25th (see docs/features/income.md for the worked example).
const luzern2026 = new Map([
  ['2026-05-25', 'Pfingstmontag'],
  ['2026-12-25', 'Weihnachten']
])

describe('computePayout', () => {
  it('leaves a plain working day untouched', () => {
    expect(computePayout(2026, 1, 26, 'earlier')).toEqual({ date: '2026-01-26', reason: null })
  })

  it('shifts a weekend earlier', () => {
    // 2026-01-25 is a Sunday
    expect(computePayout(2026, 1, 25, 'earlier')).toEqual({
      date: '2026-01-23',
      reason: 'Weekend'
    })
  })

  it('shifts a weekend later', () => {
    expect(computePayout(2026, 1, 25, 'later')).toEqual({
      date: '2026-01-26',
      reason: 'Weekend'
    })
  })

  it('shifts past a holiday and the weekend before it', () => {
    // 2026-05-25 is Pfingstmontag; earlier skips Sun 24 and Sat 23 to Fri 22
    expect(computePayout(2026, 5, 25, 'earlier', luzern2026)).toEqual({
      date: '2026-05-22',
      reason: 'Pfingstmontag'
    })
  })

  it('shifts off a holiday to the previous working day', () => {
    // 2026-12-25 (Fri) is Weihnachten; earlier lands on Thu 24
    expect(computePayout(2026, 12, 25, 'earlier', luzern2026)).toEqual({
      date: '2026-12-24',
      reason: 'Weihnachten'
    })
  })

  it('does not move when the rule is none', () => {
    expect(computePayout(2026, 1, 25, 'none')).toEqual({ date: '2026-01-25', reason: null })
  })

  it('clamps the payout day to the last day of the month', () => {
    expect(computePayout(2026, 2, 31, 'none')).toEqual({ date: '2026-02-28', reason: null })
  })
})
