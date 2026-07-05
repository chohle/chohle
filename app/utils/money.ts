// Swiss franc formatter. Amounts are stored in Rappen; render with de-CH
// number formatting. Most list/overview views show whole francs (the
// default); detail and print views pass digits = 2 for exact amounts.

export function chf(rappen: number, digits: number = 0): string {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}
