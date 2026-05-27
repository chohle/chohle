export interface InvoiceLine {
  quantity: number
  unitPriceRappen: number
  discountPercent: number
  mwstPercent: number
}

export interface MwstRate {
  rate: number
  netRappen: number
  mwstRappen: number
}

export interface InvoiceTotals {
  nettoRappen: number
  mwstByRate: MwstRate[]
  totalMwstRappen: number
  totalRappen: number
}

// Swiss 5-Rappen (Rappenrundung): round to the nearest 0.05 CHF.
function round5(rappen: number): number {
  return Math.round(rappen / 5) * 5
}

// Coerce an incoming article id to a positive integer, or null when absent.
// Only numbers and integer-shaped strings are accepted; booleans, objects and
// the like are rejected outright so they can't slip past Number() coercion and
// break the articles foreign key.
export function normalizeArticleId(value: unknown): number | null {
  let n: number
  if (typeof value === 'number') {
    n = value
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) return null
    n = Number(trimmed)
  } else {
    return null
  }
  return Number.isInteger(n) && n > 0 ? n : null
}

export function lineNetRappen(line: InvoiceLine): number {
  const gross = line.quantity * line.unitPriceRappen
  return Math.round(gross * (1 - line.discountPercent / 100))
}

// When vatRegistered is false (e.g. a private person under the CHF 100k threshold),
// no MWST is charged: the total is just the net and there are no rate breakdowns.
export function computeInvoiceTotals(lines: InvoiceLine[], vatRegistered = true): InvoiceTotals {
  let netto = 0
  const netByRate = new Map<number, number>()

  for (const line of lines) {
    const net = lineNetRappen(line)
    netto += net
    netByRate.set(line.mwstPercent, (netByRate.get(line.mwstPercent) ?? 0) + net)
  }

  if (!vatRegistered) {
    return { nettoRappen: netto, mwstByRate: [], totalMwstRappen: 0, totalRappen: netto }
  }

  const mwstByRate = [...netByRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, netRappen]) => ({
      rate,
      netRappen,
      mwstRappen: round5((netRappen * rate) / 100)
    }))

  const totalMwstRappen = mwstByRate.reduce((sum, r) => sum + r.mwstRappen, 0)
  const totalRappen = round5(netto + totalMwstRappen)

  return { nettoRappen: netto, mwstByRate, totalMwstRappen, totalRappen }
}