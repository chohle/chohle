// Dev-only helper to inspect the cached cantonal holidays.
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const { canton = 'LU', year } = getQuery(event)
  const y = Number(year) || new Date().getFullYear()
  const map = await getHolidays(String(canton), y)

  return { canton, year: y, count: map.size, holidays: Object.fromEntries(map) }
})
