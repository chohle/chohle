interface OpenHoliday {
  startDate: string
  name: { language: string, text: string }[]
}

function holidayName(h: OpenHoliday): string {
  const de = h.name.find((n) => n.language === 'DE')
  return (de ?? h.name[0])?.text ?? 'Feiertag'
}

async function fetchOpenHolidays(canton: string, year: number): Promise<OpenHoliday[]> {
  return await $fetch<OpenHoliday[]>('https://openholidaysapi.org/PublicHolidays', {
    query: {
      countryIsoCode: 'CH',
      languageIsoCode: 'DE',
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
      subdivisionCode: `CH-${canton}`
    }
  })
}

// Cantonal public holidays for a year as a date -> name map. Fetched once from
// OpenHolidays and cached in the database, so it works offline afterwards.
export async function getHolidays(canton: string, year: number): Promise<Map<string, string>> {
  const db = useDb()

  const cached = db
    .prepare('SELECT date, name FROM holidays WHERE canton = ? AND year = ?')
    .all(canton, year) as { date: string, name: string }[]
  if (cached.length) {
    return new Map(cached.map((r) => [r.date, r.name]))
  }

  let fetched: OpenHoliday[]
  try {
    fetched = await fetchOpenHolidays(canton, year)
  } catch {
    // Offline with nothing cached: degrade to weekends only.
    return new Map()
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO holidays (canton, year, date, name) VALUES (?, ?, ?, ?)'
  )
  const map = new Map<string, string>()
  db.transaction(() => {
    for (const h of fetched) {
      const name = holidayName(h)
      insert.run(canton, year, h.startDate, name)
      map.set(h.startDate, name)
    }
  })()
  return map
}
