// Tests for the pure Mahnungen helpers (no DB). The endpoint that
// uses these is exercised via manual QA + Mailpit; the level picker,
// eligibility check, days-between, and template renderer are the bits
// that benefit most from unit coverage because edge cases live here.

import { describe, expect, it } from 'vitest'
import {
  type SenderReminderConfig,
  daysBetween,
  isLevelDue,
  nextLevel,
  renderTemplate,
  templateFor
} from '../server/utils/reminders'

const cfg: SenderReminderConfig = {
  reminder1_wait_days: 7,
  reminder1_subject: 's1',
  reminder1_body: 'b1',
  reminder2_wait_days: 14,
  reminder2_subject: 's2',
  reminder2_body: 'b2',
  reminder3_wait_days: 30,
  reminder3_subject: 's3',
  reminder3_body: 'b3'
}

describe('nextLevel', () => {
  it('returns 1 when nothing sent', () => {
    expect(nextLevel(0)).toBe(1)
  })
  it('advances 1 -> 2 -> 3', () => {
    expect(nextLevel(1)).toBe(2)
    expect(nextLevel(2)).toBe(3)
  })
  it('returns null after three sent (no more levels)', () => {
    expect(nextLevel(3)).toBeNull()
    expect(nextLevel(99)).toBeNull()
  })
})

describe('templateFor', () => {
  it('returns the wait days + subject + body for the requested level', () => {
    expect(templateFor(1, cfg)).toEqual({ waitDays: 7, subject: 's1', body: 'b1' })
    expect(templateFor(2, cfg)).toEqual({ waitDays: 14, subject: 's2', body: 'b2' })
    expect(templateFor(3, cfg)).toEqual({ waitDays: 30, subject: 's3', body: 'b3' })
  })
})

describe('daysBetween', () => {
  it('returns 0 for the same calendar day', () => {
    expect(daysBetween('2026-05-31', '2026-05-31')).toBe(0)
  })
  it('returns the whole-day delta forwards and backwards', () => {
    expect(daysBetween('2026-05-31', '2026-06-01')).toBe(1)
    expect(daysBetween('2026-06-01', '2026-05-31')).toBe(-1)
    expect(daysBetween('2026-05-01', '2026-05-31')).toBe(30)
  })
  it('handles month / year rollover', () => {
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2) // 2024 is a leap year
    expect(daysBetween('2025-02-28', '2025-03-01')).toBe(1) // 2025 is not
  })
})

describe('isLevelDue', () => {
  it('level 1 needs due_date + reminder1_wait_days elapsed', () => {
    // due 10 days ago, wait 7 -> eligible
    expect(isLevelDue(1, '2026-05-21', null, cfg, '2026-05-31')).toBe(true)
    // due 6 days ago, wait 7 -> not yet
    expect(isLevelDue(1, '2026-05-25', null, cfg, '2026-05-31')).toBe(false)
  })

  it('level 2 needs reminder1.sent_at + reminder2_wait_days elapsed', () => {
    // last reminder 14 days ago, wait 14 -> eligible
    expect(isLevelDue(2, '2026-04-01', '2026-05-17T08:00:00Z', cfg, '2026-05-31')).toBe(true)
    // last reminder 13 days ago, wait 14 -> not yet
    expect(isLevelDue(2, '2026-04-01', '2026-05-18T08:00:00Z', cfg, '2026-05-31')).toBe(false)
    // no previous reminder logged but level 2 requested -> not eligible
    expect(isLevelDue(2, '2026-04-01', null, cfg, '2026-05-31')).toBe(false)
  })

  it('level 3 needs reminder2.sent_at + reminder3_wait_days elapsed', () => {
    expect(isLevelDue(3, '2026-04-01', '2026-05-01T08:00:00Z', cfg, '2026-05-31')).toBe(true)
    expect(isLevelDue(3, '2026-04-01', '2026-05-15T08:00:00Z', cfg, '2026-05-31')).toBe(false)
  })
})

describe('renderTemplate', () => {
  const ctx = {
    customerName: 'ACME AG',
    invoiceNumber: 'R-2026-001',
    amountChf: "1'250.00",
    issuedDate: '2026-04-01',
    dueDate: '2026-05-01',
    daysOverdue: 30,
    senderName: 'Studio Müller'
  }

  it('fills every placeholder', () => {
    const tpl =
      'Hallo {customer}, Rechnung {number} über CHF {amount} (Datum {issued}, ' +
      'fällig {due}, {days_overdue} Tage). {sender}'
    expect(renderTemplate(tpl, ctx)).toBe(
      "Hallo ACME AG, Rechnung R-2026-001 über CHF 1'250.00 (Datum 2026-04-01, " +
        'fällig 2026-05-01, 30 Tage). Studio Müller'
    )
  })

  it('replaces every occurrence of a repeated placeholder', () => {
    expect(renderTemplate('{customer}, {customer}!', ctx)).toBe('ACME AG, ACME AG!')
  })

  it('passes through templates with no placeholders untouched', () => {
    expect(renderTemplate('just text', ctx)).toBe('just text')
  })
})
