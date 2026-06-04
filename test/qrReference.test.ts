import { describe, expect, it } from 'vitest'
import { calculateSCORReferenceChecksum, isQRIBAN } from 'swissqrbill/utils'
import { buildReference, parseReference } from '../server/utils/qrReference'

// A QR-IBAN (institution id in the 30000-31999 range) forces a QRR reference;
// any other valid IBAN forces a SCOR reference. Guard that assumption so the
// round-trip tests below are actually exercising both branches.
const QR_IBAN = 'CH4431999123000889012'
const REGULAR_IBAN = 'CH9300762011623852957'

describe('IBAN fixtures classify as expected', () => {
  it('QR_IBAN is a QR-IBAN and REGULAR_IBAN is not', () => {
    expect(isQRIBAN(QR_IBAN)).toBe(true)
    expect(isQRIBAN(REGULAR_IBAN)).toBe(false)
  })
})

const IDS = [1, 7, 42, 1000, 999999]

describe('buildReference / parseReference round-trip', () => {
  it('QRR (QR-IBAN) builds 27 digits and reverses to the invoice id', () => {
    for (const id of IDS) {
      const ref = buildReference(id, QR_IBAN)
      expect(ref).toMatch(/^\d{27}$/)
      expect(parseReference(ref)).toBe(id)
    }
  })

  it('SCOR (regular IBAN) builds an RF reference and reverses to the invoice id', () => {
    for (const id of IDS) {
      const ref = buildReference(id, REGULAR_IBAN)
      expect(ref).toMatch(/^RF\d{2}\d+$/)
      expect(parseReference(ref)).toBe(id)
    }
  })

  it('ignores whitespace from a reference copied out of a statement', () => {
    const id = 12345
    const qrr = buildReference(id, QR_IBAN)
    const spaced = qrr.replace(/(.{5})/g, '$1 ').trim() // "xxxxx xxxxx ..."
    expect(parseReference(spaced)).toBe(id)
  })
})

describe('parseReference rejects references chohle did not issue', () => {
  it('rejects a QRR with a tampered check digit', () => {
    const ref = buildReference(42, QR_IBAN)
    const tampered = ref.slice(0, 26) + ((Number(ref[26]) + 1) % 10)
    expect(parseReference(tampered)).toBeNull()
  })

  it('rejects a SCOR with a tampered checksum', () => {
    const ref = buildReference(42, REGULAR_IBAN)
    const wrong = ((Number(ref.slice(2, 4)) + 1) % 100).toString().padStart(2, '0')
    expect(parseReference(`RF${wrong}${ref.slice(4)}`)).toBeNull()
  })

  it('rejects a checksum-valid SCOR whose body is not a numeric invoice id', () => {
    const body = 'ABC123'
    const ref = `RF${calculateSCORReferenceChecksum(body)}${body}`
    expect(parseReference(ref)).toBeNull()
  })

  it('rejects empty, garbage, and wrong-length input', () => {
    expect(parseReference('')).toBeNull()
    expect(parseReference('hello world')).toBeNull()
    expect(parseReference('12345')).toBeNull()
    expect(parseReference('RF')).toBeNull()
  })
})
