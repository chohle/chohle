export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const { month } = getQuery(event)
  const select = `
    SELECT e.id, e.title, e.amount_rappen, e.currency, e.date, e.vendor, e.notes,
           e.category_id, c.name AS category_name, c.color AS category_color,
           c.icon AS category_icon
    FROM expenses e
    LEFT JOIN categories c ON c.id = e.category_id
  `
  const order = ' ORDER BY e.date DESC, e.id DESC'
  const db = useDb()

  if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
    return db.prepare(`${select} WHERE e.date LIKE ?${order}`).all(`${month}%`)
  }
  return db.prepare(select + order).all()
})