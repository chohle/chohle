import { describe, expect, it } from 'vitest'
import { computeInvoiceTotals, lineNetRappen, normalizeArticleId } from '../shared/utils/invoice'

describe('computeInvoiceTotals', () => {
  it('matches the FEATURES verification case', () => {
    // Netto 5'362.50, MWST 8.1% 434.35, Total 5'796.85
    const totals = computeInvoiceTotals([
      { quantity: 1, unitPriceRappen: 536250, discountPercent: 0, mwstPercent: 8.1 }
    ])
    expect(totals.nettoRappen).toBe(536250)
    expect(totals.mwstByRate).toEqual([{ rate: 8.1, netRappen: 536250, mwstRappen: 43435 }])
    expect(totals.totalRappen).toBe(579685)
  })

  it('applies a line discount', () => {
    // 2 x 100.00 with 10% off = 180.00 net
    expect(
      lineNetRappen({ quantity: 2, unitPriceRappen: 10000, discountPercent: 10, mwstPercent: 8.1 })
    ).toBe(18000)
  })

  it('groups MWST by rate, sorted', () => {
    const totals = computeInvoiceTotals([
      { quantity: 1, unitPriceRappen: 10000, discountPercent: 0, mwstPercent: 8.1 },
      { quantity: 1, unitPriceRappen: 20000, discountPercent: 0, mwstPercent: 2.6 }
    ])
    expect(totals.nettoRappen).toBe(30000)
    expect(totals.mwstByRate.map((r) => r.rate)).toEqual([2.6, 8.1])
    // 200.00 * 2.6% = 5.20 -> 520; 100.00 * 8.1% = 8.10 -> 810 (round5)
    expect(totals.totalMwstRappen).toBe(520 + 810)
  })

  it('rounds MWST to 5 Rappen', () => {
    // 100.00 * 8.1% = 8.10 exactly; 123.45 net needs rounding
    const totals = computeInvoiceTotals([
      { quantity: 1, unitPriceRappen: 12345, discountPercent: 0, mwstPercent: 8.1 }
    ])
    // 123.45 * 8.1% = 9.99945 -> 10.00 (round5)
    expect(totals.mwstByRate[0]!.mwstRappen).toBe(1000)
  })

  it('handles no lines', () => {
    expect(computeInvoiceTotals([])).toEqual({
      nettoRappen: 0,
      mwstByRate: [],
      totalMwstRappen: 0,
      totalRappen: 0
    })
  })

  it('charges no MWST when the sender is not VAT-registered', () => {
    const totals = computeInvoiceTotals(
      [{ quantity: 1, unitPriceRappen: 536250, discountPercent: 0, mwstPercent: 8.1 }],
      false
    )
    expect(totals).toEqual({
      nettoRappen: 536250,
      mwstByRate: [],
      totalMwstRappen: 0,
      totalRappen: 536250
    })
  })
})

describe('normalizeArticleId', () => {
  it('keeps a positive integer id', () => {
    expect(normalizeArticleId(7)).toBe(7)
    expect(normalizeArticleId('7')).toBe(7)
  })

  it('returns null for an absent id instead of 0 (would break the FK)', () => {
    expect(normalizeArticleId(null)).toBeNull()
    expect(normalizeArticleId(undefined)).toBeNull()
    expect(normalizeArticleId('')).toBeNull()
    expect(normalizeArticleId(0)).toBeNull()
  })

  it('returns null for non-integer or invalid values', () => {
    expect(normalizeArticleId(2.5)).toBeNull()
    expect(normalizeArticleId(-3)).toBeNull()
    expect(normalizeArticleId('abc')).toBeNull()
  })

  it('rejects non-number/string types instead of coercing them', () => {
    expect(normalizeArticleId(true)).toBeNull()
    expect(normalizeArticleId(false)).toBeNull()
    expect(normalizeArticleId([5])).toBeNull()
    expect(normalizeArticleId({})).toBeNull()
  })
})
