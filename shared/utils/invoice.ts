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

export function lineNetRappen(line: InvoiceLine): number {
  const gross = line.quantity * line.unitPriceRappen
  return Math.round(gross * (1 - line.discountPercent / 100))
}

export function computeInvoiceTotals(lines: InvoiceLine[]): InvoiceTotals {
  let netto = 0
  const netByRate = new Map<number, number>()

  for (const line of lines) {
    const net = lineNetRappen(line)
    netto += net
    netByRate.set(line.mwstPercent, (netByRate.get(line.mwstPercent) ?? 0) + net)
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