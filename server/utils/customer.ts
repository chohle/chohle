const LANGUAGES = ['de', 'fr', 'it', 'en']

export interface CustomerInput {
  type: 'person' | 'company'
  name: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  street: string | null
  zip: string | null
  city: string | null
  country: string
  language: string
  customerNumber: string | null
  priceCategory: string | null
  discountPercent: number
  paymentTermDays: number
  website: string | null
  foundingYear: number | null
  social: string | null
  uid: string | null
  mwst: string | null
  hrNumber: string | null
}

export function parseCustomer(body: Record<string, unknown>): CustomerInput {
  const s = (v: unknown) => String(v ?? '').trim()
  const opt = (v: unknown) => s(v) || null

  const name = s(body?.name)
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const discount = Number(body?.discountPercent)
  const term = Number(body?.paymentTermDays)
  const founding = Number(body?.foundingYear)
  const language = LANGUAGES.includes(String(body?.language)) ? String(body?.language) : 'de'

  return {
    type: body?.type === 'person' ? 'person' : 'company',
    name,
    contactPerson: opt(body?.contactPerson),
    email: opt(body?.email),
    phone: opt(body?.phone),
    street: opt(body?.street),
    zip: opt(body?.zip),
    city: opt(body?.city),
    country: s(body?.country) || 'CH',
    language,
    customerNumber: opt(body?.customerNumber),
    priceCategory: opt(body?.priceCategory),
    discountPercent: Number.isFinite(discount) && discount >= 0 ? discount : 0,
    paymentTermDays: Number.isInteger(term) && term >= 0 ? term : 30,
    website: opt(body?.website),
    foundingYear: Number.isInteger(founding) ? founding : null,
    social: opt(body?.social),
    uid: opt(body?.uid),
    mwst: opt(body?.mwst),
    hrNumber: opt(body?.hrNumber)
  }
}

// Column order shared by the INSERT and UPDATE statements.
export const CUSTOMER_COLUMNS = [
  'type',
  'name',
  'contact_person',
  'email',
  'phone',
  'street',
  'zip',
  'city',
  'country',
  'language',
  'customer_number',
  'price_category',
  'discount_percent',
  'payment_term_days',
  'website',
  'founding_year',
  'social',
  'uid',
  'mwst',
  'hr_number'
]

export function customerValues(c: CustomerInput) {
  return [
    c.type,
    c.name,
    c.contactPerson,
    c.email,
    c.phone,
    c.street,
    c.zip,
    c.city,
    c.country,
    c.language,
    c.customerNumber,
    c.priceCategory,
    c.discountPercent,
    c.paymentTermDays,
    c.website,
    c.foundingYear,
    c.social,
    c.uid,
    c.mwst,
    c.hrNumber
  ]
}
