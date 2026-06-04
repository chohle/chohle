import {
  calculateQRReferenceChecksum,
  calculateSCORReferenceChecksum,
  isQRIBAN,
  isQRReferenceValid,
  isSCORReferenceValid
} from 'swissqrbill/utils'

// The payment reference chohle prints on a QR-bill is derived deterministically
// from the invoice id, so a credit transaction in a camt.053 statement can be
// reversed straight back to the invoice it pays (see server/utils/reconcile.ts).
// buildReference and parseReference are exact inverses — keep them that way; the
// round-trip is unit-tested in test/qrReference.test.ts.

/**
 * Builds the reference for an invoice's QR-bill.
 *
 * - QR-IBAN -> QRR: the 26-digit zero-padded id plus a mod-10 check digit
 *   (27 digits total).
 * - regular IBAN -> SCOR: "RF" + ISO 11649 check digits + the bare id.
 */
export function buildReference(invoiceId: number, iban: string): string {
  const account = (iban ?? '').replace(/\s/g, '')
  if (isQRIBAN(account)) {
    const base = String(invoiceId).padStart(26, '0')
    return base + calculateQRReferenceChecksum(base)
  }
  return `RF${calculateSCORReferenceChecksum(String(invoiceId))}${invoiceId}`
}

/**
 * Recovers the invoice id a payment reference points at, or null if the
 * reference is not one chohle issued: wrong shape, a failed checksum, or a
 * non-numeric / out-of-range id. Whitespace and case are normalized first so a
 * reference copied verbatim from a camt.053 statement still parses.
 */
export function parseReference(ref: string): number | null {
  const clean = (ref ?? '').replace(/\s/g, '').toUpperCase()
  if (!clean) return null

  // SCOR: RF + 2 check digits + the bare id.
  if (clean.startsWith('RF')) {
    if (!isSCORReferenceValid(clean)) return null
    return toInvoiceId(clean.slice(4))
  }

  // QRR: 27 digits, the last is the check digit, the first 26 are the padded id.
  if (/^\d{27}$/.test(clean)) {
    if (!isQRReferenceValid(clean)) return null
    return toInvoiceId(clean.slice(0, 26))
  }

  return null
}

function toInvoiceId(digits: string): number | null {
  if (!/^\d+$/.test(digits)) return null
  const id = Number(digits)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
