export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const b = await readBody(event)
  const s = (v: unknown) => String(v ?? '').trim()
  const type = b?.type === 'company' ? 'company' : 'person'
  const foundingYear = Number(b?.foundingYear)
  const vatRegistered = b?.vatRegistered ? 1 : 0

  const db = useDb()
  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
  db.prepare(
    `UPDATE sender SET
       type = ?, name = ?, street = ?, zip = ?, city = ?, country = ?,
       email = ?, phone = ?, website = ?, iban = ?,
       uid = ?, mwst = ?, hr_number = ?, founding_year = ?, vat_registered = ?
     WHERE id = 1`
  ).run(
    type,
    s(b?.name),
    s(b?.street),
    s(b?.zip),
    s(b?.city),
    s(b?.country) || 'CH',
    s(b?.email),
    s(b?.phone),
    s(b?.website),
    s(b?.iban),
    s(b?.uid),
    s(b?.mwst),
    s(b?.hrNumber),
    Number.isInteger(foundingYear) ? foundingYear : null,
    vatRegistered
  )

  return { ok: true }
})
