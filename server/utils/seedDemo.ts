import type { Database } from 'better-sqlite3'

// Idempotent demo data, shared between the `seed` CLI (scripts/seed-dev.mjs)
// and the server. seedDemo() wipes the business tables (keeps the owner login)
// and reseeds a realistic month at a glance plus a populated project pipeline,
// all in the requested locale. It also points owner.locale and every customer's
// document language at that locale, so the whole app is coherent in one
// language.
//
// DESTRUCTIVE: this deletes all business rows. Only call it for throwaway demo
// data (the CLI, or a guarded demo-mode path) — never against real data.
//
// All human-readable strings live in the STR dictionary below, one block per
// supported locale. Proper nouns (people, companies, places, brands like
// Migros/Adobe) are intentionally not translated.

export const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'it'] as const
export type SeedLocale = (typeof SUPPORTED_LOCALES)[number]

// --- Translations -------------------------------------------------------
// Every block has the exact same shape; lookups go through S = STR[locale].
const STR = {
  en: {
    units: { hours: 'Hours', flat: 'Flat rate', month: 'Month' },
    cat: {
      groceries: 'Groceries', dining: 'Dining', transport: 'Transport', rent: 'Rent',
      utilities: 'Utilities', software: 'Software', health: 'Health', office: 'Office',
      salary: 'Salary', freelance: 'Freelance'
    },
    art: {
      consulting: 'Consulting', maintenance: 'Maintenance work', webdesign: 'Web design',
      hosting: 'Hosting', expenses: 'Expenses', retainer: 'Retainer support',
      express: 'Express surcharge', cleaning: 'Site cleaning'
    },
    job: { swEngineer: 'Software Engineer', uxConsulting: 'UX consulting' },
    exp: {
      rentLuzern: 'Rent, Apartment Lucerne', migrosWeekly: 'Migros weekly shop',
      gaTravelcard: 'GA Travelcard', lunchClient: 'Lunch with client',
      adobe: 'Adobe Creative Cloud', coopGroceries: 'Coop groceries', electricity: 'Electricity',
      physio: 'Physiotherapy', dinnerOut: 'Dinner out', petrol: 'Petrol', mobilePlan: 'Mobile plan',
      githubTeam: 'GitHub Team', officeChair: 'Office chair (new)', groceries: 'Groceries',
      trainTickets: 'Train tickets', softwareSubs: 'Software subscriptions', dentist: 'Dentist'
    },
    proj: {
      webshop: { name: 'Webshop redesign', label: 'New storefront with checkout', notes: 'First call promising. Wants mockups by end of month.' },
      logoCi: { name: 'Logo & CI', label: 'Personal brand identity', notes: '' },
      booking: { name: 'Restaurant booking system', label: 'OpenTable integration', notes: 'Sent reference projects.' },
      marketing: { name: 'Marketing site', label: 'Static landing + CMS', notes: 'Proposal sent, awaiting answer.' },
      maintContract: { name: 'Maintenance contract 2026', label: 'Yearly maintenance contract', notes: 'Won! Annual maintenance.' },
      relaunch: { name: 'Website relaunch', label: 'Full redesign + migration', notes: 'In production. Phase 1 invoiced.' },
      consultingQ1: { name: 'Consulting Q1', label: 'Retainer 20h/month', notes: 'Active retainer.' },
      audit: { name: 'Website audit', label: 'One off audit + report', notes: 'Done. Invoiced and paid.' },
      laptops: { name: 'Team laptops', label: 'Need 3 new MacBooks', notes: 'Working laptops getting old.' },
      cleaningQuotes: { name: 'Cleaning service quotes', label: 'Weekly office cleaning', notes: 'Sent RFQ to 3 suppliers.' },
      hostingCompare: { name: 'Server hosting comparison', label: 'EU based VPS', notes: 'Got 3 offers. Evaluating.' },
      furniture: { name: 'Office furniture', label: 'Standing desks + chairs', notes: 'Order placed at Pfister.' },
      legacyHeating: { name: 'Heating control (maintenance)', label: 'One off maintenance visit', notes: 'Old job. Closed.' },
      quickConsulting: { name: 'Digitalization coaching', label: 'One off coaching session', notes: 'Just bill the hours.' }
    },
    email: {
      subj1: 'Proposal: Marketing site',
      text1: 'Hi Thomas,\n\nFollowing up on our call, please find attached the proposal for the new Müller Bau marketing site.\n\nBudget: CHF 6,000 fixed price, two milestones.\n\nLooking forward to your feedback.\n\nBest,\nchohle',
      text2: 'Hi, thanks. We discussed internally and want to go ahead. Can we schedule a kickoff call next week?\n\nThomas'
    },
    inv: {
      t101: 'Heating control maintenance', t001: 'Maintenance contract 2026 (Q1)',
      t002: 'Website relaunch (phase 1)', t003: 'Website relaunch (phase 2)',
      t004: 'Website relaunch (phase 3)', t099: 'Website audit + report',
      t005: 'Digitalization consulting'
    },
    quo: {
      q1: 'Marketing site relaunch', q2: 'Follow-up digitalization consulting',
      q3: 'Branding refresh', q4: 'IT audit Q4', q0: 'Website relaunch (quote)'
    },
    desc: {
      maintenanceWork: 'Maintenance work', travel: 'Travel', travels: 'Travel',
      maintQ1: 'Maintenance January to March', conceptDesign: 'Concept and design',
      stakeholderWorkshops: 'Stakeholder workshops', implSprint1: 'Implementation sprint 1',
      reviewsIterations: 'Reviews and iterations', implSprint2: 'Implementation sprint 2',
      auditReport: 'Audit, report and recommendations', toolLicenses: 'Tool licenses',
      consulting: 'Consulting', conceptWireframes: 'Concept, wireframes, design system',
      workshopSupport: 'Workshop and support', logoVariations: 'Logo variations',
      strategyTalk: 'Strategy session'
    }
  },

  de: {
    units: { hours: 'Stunden', flat: 'Pauschal', month: 'Monat' },
    cat: {
      groceries: 'Lebensmittel', dining: 'Restaurant', transport: 'Transport', rent: 'Miete',
      utilities: 'Nebenkosten', software: 'Software', health: 'Gesundheit', office: 'Büro',
      salary: 'Lohn', freelance: 'Freelance'
    },
    art: {
      consulting: 'Beratung', maintenance: 'Wartungsarbeiten', webdesign: 'Webdesign',
      hosting: 'Hosting', expenses: 'Spesen', retainer: 'Retainer Betreuung',
      express: 'Express-Zuschlag', cleaning: 'Reinigung Baustelle'
    },
    job: { swEngineer: 'Software Engineer', uxConsulting: 'UX-Beratung' },
    exp: {
      rentLuzern: 'Miete, Wohnung Luzern', migrosWeekly: 'Wocheneinkauf Migros',
      gaTravelcard: 'Generalabonnement', lunchClient: 'Mittagessen mit Kunde',
      adobe: 'Adobe Creative Cloud', coopGroceries: 'Lebensmittel Coop', electricity: 'Strom',
      physio: 'Physiotherapie', dinnerOut: 'Abendessen auswärts', petrol: 'Benzin', mobilePlan: 'Mobilabo',
      githubTeam: 'GitHub Team', officeChair: 'Bürostuhl (neu)', groceries: 'Lebensmittel',
      trainTickets: 'Bahntickets', softwareSubs: 'Software-Abos', dentist: 'Zahnarzt'
    },
    proj: {
      webshop: { name: 'Webshop-Redesign', label: 'Neuer Shop mit Checkout', notes: 'Erstes Gespräch vielversprechend. Will Mockups bis Monatsende.' },
      logoCi: { name: 'Logo & CI', label: 'Persönliche Markenidentität', notes: '' },
      booking: { name: 'Restaurant-Reservationssystem', label: 'OpenTable-Integration', notes: 'Referenzprojekte gesendet.' },
      marketing: { name: 'Marketing-Website', label: 'Statische Landingpage + CMS', notes: 'Offerte gesendet, warten auf Antwort.' },
      maintContract: { name: 'Wartungsvertrag 2026', label: 'Jährlicher Wartungsvertrag', notes: 'Gewonnen! Jährliche Wartung.' },
      relaunch: { name: 'Website-Relaunch', label: 'Komplettes Redesign + Migration', notes: 'In Umsetzung. Phase 1 verrechnet.' },
      consultingQ1: { name: 'Beratung Q1', label: 'Retainer 20 Std./Monat', notes: 'Aktiver Retainer.' },
      audit: { name: 'Website-Audit', label: 'Einmaliges Audit + Bericht', notes: 'Erledigt. Verrechnet und bezahlt.' },
      laptops: { name: 'Team-Laptops', label: '3 neue MacBooks benötigt', notes: 'Aktuelle Laptops werden alt.' },
      cleaningQuotes: { name: 'Offerten Reinigungsdienst', label: 'Wöchentliche Büroreinigung', notes: 'Anfrage an 3 Anbieter gesendet.' },
      hostingCompare: { name: 'Server-Hosting-Vergleich', label: 'VPS in der EU', notes: '3 Offerten erhalten. In Prüfung.' },
      furniture: { name: 'Büromöbel', label: 'Stehpulte + Stühle', notes: 'Bestellung bei Pfister aufgegeben.' },
      legacyHeating: { name: 'Heizungssteuerung (Wartung)', label: 'Einmaliger Wartungsbesuch', notes: 'Alter Auftrag. Abgeschlossen.' },
      quickConsulting: { name: 'Digitalisierung Coaching', label: 'Einmalige Coaching-Session', notes: 'Einfach die Stunden verrechnen.' }
    },
    email: {
      subj1: 'Offerte: Marketing-Website',
      text1: 'Hallo Thomas,\n\nim Anschluss an unser Gespräch sende ich dir die Offerte für die neue Marketing-Website von Müller Bau.\n\nBudget: CHF 6’000 Festpreis, zwei Meilensteine.\n\nIch freue mich auf dein Feedback.\n\nBeste Grüsse,\nchohle',
      text2: 'Hallo, danke. Wir haben das intern besprochen und möchten loslegen. Können wir nächste Woche einen Kickoff-Call vereinbaren?\n\nThomas'
    },
    inv: {
      t101: 'Wartung Heizungssteuerung', t001: 'Wartungsvertrag 2026 (Q1)',
      t002: 'Website-Relaunch (Phase 1)', t003: 'Website-Relaunch (Phase 2)',
      t004: 'Website-Relaunch (Phase 3)', t099: 'Website-Audit + Bericht',
      t005: 'Beratung Digitalisierung'
    },
    quo: {
      q1: 'Marketing-Website Relaunch', q2: 'Folge-Beratung Digitalisierung',
      q3: 'Branding-Auffrischung', q4: 'IT-Audit Q4', q0: 'Website-Relaunch (Angebot)'
    },
    desc: {
      maintenanceWork: 'Wartungsarbeiten', travel: 'Anfahrt', travels: 'Anfahrten',
      maintQ1: 'Wartung Januar bis März', conceptDesign: 'Konzept und Design',
      stakeholderWorkshops: 'Stakeholder-Workshops', implSprint1: 'Umsetzung Sprint 1',
      reviewsIterations: 'Reviews und Iterationen', implSprint2: 'Umsetzung Sprint 2',
      auditReport: 'Audit, Bericht und Empfehlungen', toolLicenses: 'Tool-Lizenzen',
      consulting: 'Beratung', conceptWireframes: 'Konzept, Wireframes, Designsystem',
      workshopSupport: 'Workshop und Begleitung', logoVariations: 'Logo-Variationen',
      strategyTalk: 'Strategiegespräch'
    }
  },

  fr: {
    units: { hours: 'Heures', flat: 'Forfait', month: 'Mois' },
    cat: {
      groceries: 'Alimentation', dining: 'Restaurant', transport: 'Transport', rent: 'Loyer',
      utilities: 'Charges', software: 'Logiciels', health: 'Santé', office: 'Bureau',
      salary: 'Salaire', freelance: 'Freelance'
    },
    art: {
      consulting: 'Conseil', maintenance: 'Travaux de maintenance', webdesign: 'Conception web',
      hosting: 'Hébergement', expenses: 'Frais', retainer: 'Forfait de suivi',
      express: 'Supplément express', cleaning: 'Nettoyage de chantier'
    },
    job: { swEngineer: 'Ingénieur logiciel', uxConsulting: 'Conseil UX' },
    exp: {
      rentLuzern: 'Loyer, appartement Lucerne', migrosWeekly: 'Courses hebdo Migros',
      gaTravelcard: 'Abonnement général', lunchClient: 'Déjeuner avec client',
      adobe: 'Adobe Creative Cloud', coopGroceries: 'Courses Coop', electricity: 'Électricité',
      physio: 'Physiothérapie', dinnerOut: 'Dîner au restaurant', petrol: 'Essence', mobilePlan: 'Abonnement mobile',
      githubTeam: 'GitHub Team', officeChair: 'Chaise de bureau (neuve)', groceries: 'Alimentation',
      trainTickets: 'Billets de train', softwareSubs: 'Abonnements logiciels', dentist: 'Dentiste'
    },
    proj: {
      webshop: { name: 'Refonte de la boutique en ligne', label: 'Nouvelle boutique avec paiement', notes: 'Premier appel prometteur. Souhaite des maquettes d’ici la fin du mois.' },
      logoCi: { name: 'Logo & CI', label: 'Identité de marque personnelle', notes: '' },
      booking: { name: 'Système de réservation restaurant', label: 'Intégration OpenTable', notes: 'Projets de référence envoyés.' },
      marketing: { name: 'Site marketing', label: 'Landing statique + CMS', notes: 'Offre envoyée, en attente de réponse.' },
      maintContract: { name: 'Contrat de maintenance 2026', label: 'Contrat de maintenance annuel', notes: 'Gagné ! Maintenance annuelle.' },
      relaunch: { name: 'Refonte du site web', label: 'Refonte complète + migration', notes: 'En production. Phase 1 facturée.' },
      consultingQ1: { name: 'Conseil T1', label: 'Forfait 20 h/mois', notes: 'Forfait actif.' },
      audit: { name: 'Audit du site web', label: 'Audit ponctuel + rapport', notes: 'Terminé. Facturé et payé.' },
      laptops: { name: 'Ordinateurs portables de l’équipe', label: 'Besoin de 3 nouveaux MacBooks', notes: 'Les portables actuels vieillissent.' },
      cleaningQuotes: { name: 'Offres service de nettoyage', label: 'Nettoyage hebdomadaire des bureaux', notes: 'Demande envoyée à 3 fournisseurs.' },
      hostingCompare: { name: 'Comparatif d’hébergement serveur', label: 'VPS basé en UE', notes: '3 offres reçues. En évaluation.' },
      furniture: { name: 'Mobilier de bureau', label: 'Bureaux assis-debout + chaises', notes: 'Commande passée chez Pfister.' },
      legacyHeating: { name: 'Régulation du chauffage (maintenance)', label: 'Visite de maintenance ponctuelle', notes: 'Ancien mandat. Clôturé.' },
      quickConsulting: { name: 'Coaching digitalisation', label: 'Séance de coaching ponctuelle', notes: 'Facturer simplement les heures.' }
    },
    email: {
      subj1: 'Offre : site marketing',
      text1: 'Bonjour Thomas,\n\nÀ la suite de notre appel, veuillez trouver ci-joint l’offre pour le nouveau site marketing de Müller Bau.\n\nBudget : CHF 6’000 au forfait, deux jalons.\n\nDans l’attente de votre retour.\n\nCordialement,\nchohle',
      text2: 'Bonjour, merci. Nous en avons discuté en interne et souhaitons avancer. Pouvons-nous fixer un appel de lancement la semaine prochaine ?\n\nThomas'
    },
    inv: {
      t101: 'Maintenance régulation chauffage', t001: 'Contrat de maintenance 2026 (T1)',
      t002: 'Refonte du site web (phase 1)', t003: 'Refonte du site web (phase 2)',
      t004: 'Refonte du site web (phase 3)', t099: 'Audit du site web + rapport',
      t005: 'Conseil en digitalisation'
    },
    quo: {
      q1: 'Refonte du site marketing', q2: 'Conseil digitalisation – suivi',
      q3: 'Rafraîchissement de l’image de marque', q4: 'Audit IT T4', q0: 'Refonte du site web (offre)'
    },
    desc: {
      maintenanceWork: 'Travaux de maintenance', travel: 'Déplacement', travels: 'Déplacements',
      maintQ1: 'Maintenance de janvier à mars', conceptDesign: 'Concept et design',
      stakeholderWorkshops: 'Ateliers avec les parties prenantes', implSprint1: 'Sprint de mise en œuvre 1',
      reviewsIterations: 'Revues et itérations', implSprint2: 'Sprint de mise en œuvre 2',
      auditReport: 'Audit, rapport et recommandations', toolLicenses: 'Licences d’outils',
      consulting: 'Conseil', conceptWireframes: 'Concept, wireframes, design system',
      workshopSupport: 'Atelier et accompagnement', logoVariations: 'Variations de logo',
      strategyTalk: 'Entretien stratégique'
    }
  },

  it: {
    units: { hours: 'Ore', flat: 'Forfait', month: 'Mese' },
    cat: {
      groceries: 'Spesa', dining: 'Ristorante', transport: 'Trasporti', rent: 'Affitto',
      utilities: 'Utenze', software: 'Software', health: 'Salute', office: 'Ufficio',
      salary: 'Stipendio', freelance: 'Freelance'
    },
    art: {
      consulting: 'Consulenza', maintenance: 'Lavori di manutenzione', webdesign: 'Web design',
      hosting: 'Hosting', expenses: 'Spese', retainer: 'Servizio in abbonamento',
      express: 'Supplemento express', cleaning: 'Pulizia cantiere'
    },
    job: { swEngineer: 'Ingegnere del software', uxConsulting: 'Consulenza UX' },
    exp: {
      rentLuzern: 'Affitto, appartamento Lucerna', migrosWeekly: 'Spesa settimanale Migros',
      gaTravelcard: 'Abbonamento generale', lunchClient: 'Pranzo con cliente',
      adobe: 'Adobe Creative Cloud', coopGroceries: 'Spesa Coop', electricity: 'Elettricità',
      physio: 'Fisioterapia', dinnerOut: 'Cena fuori', petrol: 'Benzina', mobilePlan: 'Abbonamento mobile',
      githubTeam: 'GitHub Team', officeChair: 'Sedia da ufficio (nuova)', groceries: 'Spesa',
      trainTickets: 'Biglietti del treno', softwareSubs: 'Abbonamenti software', dentist: 'Dentista'
    },
    proj: {
      webshop: { name: 'Restyling del webshop', label: 'Nuovo negozio con checkout', notes: 'Primo contatto promettente. Vuole i mockup entro fine mese.' },
      logoCi: { name: 'Logo & CI', label: 'Identità di marca personale', notes: '' },
      booking: { name: 'Sistema di prenotazione ristorante', label: 'Integrazione OpenTable', notes: 'Inviati progetti di riferimento.' },
      marketing: { name: 'Sito marketing', label: 'Landing statica + CMS', notes: 'Offerta inviata, in attesa di risposta.' },
      maintContract: { name: 'Contratto di manutenzione 2026', label: 'Contratto di manutenzione annuale', notes: 'Vinto! Manutenzione annuale.' },
      relaunch: { name: 'Rilancio del sito web', label: 'Restyling completo + migrazione', notes: 'In produzione. Fase 1 fatturata.' },
      consultingQ1: { name: 'Consulenza T1', label: 'Abbonamento 20 h/mese', notes: 'Abbonamento attivo.' },
      audit: { name: 'Audit del sito web', label: 'Audit una tantum + report', notes: 'Completato. Fatturato e pagato.' },
      laptops: { name: 'Laptop per il team', label: 'Servono 3 nuovi MacBook', notes: 'I laptop attuali stanno invecchiando.' },
      cleaningQuotes: { name: 'Offerte servizio di pulizia', label: 'Pulizia settimanale dell’ufficio', notes: 'Richiesta inviata a 3 fornitori.' },
      hostingCompare: { name: 'Confronto hosting server', label: 'VPS con sede in UE', notes: 'Ricevute 3 offerte. In valutazione.' },
      furniture: { name: 'Mobili per ufficio', label: 'Scrivanie regolabili + sedie', notes: 'Ordine effettuato da Pfister.' },
      legacyHeating: { name: 'Regolazione riscaldamento (manutenzione)', label: 'Intervento di manutenzione una tantum', notes: 'Vecchio incarico. Chiuso.' },
      quickConsulting: { name: 'Coaching digitalizzazione', label: 'Sessione di coaching una tantum', notes: 'Fatturare semplicemente le ore.' }
    },
    email: {
      subj1: 'Offerta: sito marketing',
      text1: 'Ciao Thomas,\n\ndopo la nostra telefonata, in allegato trovi l’offerta per il nuovo sito marketing di Müller Bau.\n\nBudget: CHF 6’000 a forfait, due milestone.\n\nResto in attesa di un tuo riscontro.\n\nCordiali saluti,\nchohle',
      text2: 'Salve, grazie. Ne abbiamo parlato internamente e vogliamo procedere. Possiamo fissare una call di kickoff la prossima settimana?\n\nThomas'
    },
    inv: {
      t101: 'Manutenzione regolazione riscaldamento', t001: 'Contratto di manutenzione 2026 (T1)',
      t002: 'Rilancio del sito web (fase 1)', t003: 'Rilancio del sito web (fase 2)',
      t004: 'Rilancio del sito web (fase 3)', t099: 'Audit del sito web + report',
      t005: 'Consulenza digitalizzazione'
    },
    quo: {
      q1: 'Rilancio del sito marketing', q2: 'Consulenza digitalizzazione – follow-up',
      q3: 'Rinfresco del branding', q4: 'Audit IT T4', q0: 'Rilancio del sito web (offerta)'
    },
    desc: {
      maintenanceWork: 'Lavori di manutenzione', travel: 'Trasferta', travels: 'Trasferte',
      maintQ1: 'Manutenzione da gennaio a marzo', conceptDesign: 'Concept e design',
      stakeholderWorkshops: 'Workshop con gli stakeholder', implSprint1: 'Sprint di implementazione 1',
      reviewsIterations: 'Revisioni e iterazioni', implSprint2: 'Sprint di implementazione 2',
      auditReport: 'Audit, report e raccomandazioni', toolLicenses: 'Licenze software',
      consulting: 'Consulenza', conceptWireframes: 'Concept, wireframe, design system',
      workshopSupport: 'Workshop e accompagnamento', logoVariations: 'Varianti del logo',
      strategyTalk: 'Colloquio strategico'
    }
  }
} as const

const chf = (amount: number) => Math.round(amount * 100)

// Build an HTML email body from the plain-text version (paragraphs split on
// blank lines, single newlines become <br>) so we only translate once.
const htmlFromText = (text: string) =>
  text
    .split('\n\n')
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')

export interface SeedResult {
  locale: SeedLocale
  categories: number
  expenses: number
  customers: number
  articles: number
  projects: number
  invoices: number
  quotes: number
}

// Wipe the business tables and reseed demo data in `locale`. The owner login is
// preserved; owner.locale and customer document languages are set to `locale`.
export function seedDemo(db: Database, requested: string): SeedResult {
  const locale: SeedLocale = (SUPPORTED_LOCALES as readonly string[]).includes(requested)
    ? (requested as SeedLocale)
    : 'en'
  const S = STR[locale]

  db.pragma('foreign_keys = ON')

  // Six months ending "today" so the dashboard trend is fully populated.
  const now = new Date()
  const ym = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const day = (offset: number, dd: number) => `${ym(offset)}-${String(dd).padStart(2, '0')}`
  const months = [5, 4, 3, 2, 1, 0].map(ym)

  const wipe = db.transaction(() => {
    // FK order matters: child tables before parents. quote_items -> quotes,
    // and quotes references invoices(converted_invoice_id), so quotes goes
    // before invoices to avoid the FK tripping mid-wipe.
    for (const t of [
      'project_emails',
      'invoice_reminders',
      'quote_items',
      'quotes',
      'invoice_items',
      'invoices',
      'projects',
      'articles',
      'customers',
      'income_payments',
      'income_sources',
      'attachments',
      'expenses',
      'categories'
    ])
      db.prepare(`DELETE FROM ${t}`).run()
    db.prepare(`DELETE FROM sqlite_sequence WHERE name NOT IN ('owner')`).run()
  })
  wipe()

  // --- Categories -------------------------------------------------------
  const insertCategory = db.prepare(
    'INSERT INTO categories (name, type, color, icon) VALUES (?, ?, ?, ?)'
  )
  const cat: Record<string, number | bigint> = {}
  const categories: [string, string, string, string][] = [
    ['groceries', 'expense', '#22c55e', 'i-lucide-shopping-cart'],
    ['dining', 'expense', '#f97316', 'i-lucide-utensils'],
    ['transport', 'expense', '#3b82f6', 'i-lucide-car'],
    ['rent', 'expense', '#6366f1', 'i-lucide-home'],
    ['utilities', 'expense', '#f59e0b', 'i-lucide-plug'],
    ['software', 'expense', '#14b8a6', 'i-lucide-smartphone'],
    ['health', 'expense', '#ec4899', 'i-lucide-heart-pulse'],
    ['office', 'expense', '#a855f7', 'i-lucide-briefcase'],
    ['salary', 'income', '#10b981', 'i-lucide-banknote'],
    ['freelance', 'income', '#8b5cf6', 'i-lucide-briefcase']
  ]
  for (const [key, type, color, icon] of categories) {
    cat[key] = insertCategory.run(S.cat[key as keyof typeof S.cat], type, color, icon).lastInsertRowid
  }

  // --- Expenses ---------------------------------------------------------
  const insertExpense = db.prepare(
    `INSERT INTO expenses (title, amount_rappen, currency, date, category_id, vendor, notes)
     VALUES (?, ?, 'CHF', ?, ?, ?, ?)`
  )
  // [monthOffset, dayOfMonth, titleKey, amount, categoryKey, vendor]
  const expenses: [number, number, string, number, string, string][] = [
    // current month, rich spread for the "month at a glance" screenshot
    [0, 1, 'rentLuzern', 1650, 'rent', 'Hausverwaltung Meier'],
    [0, 3, 'migrosWeekly', 87.4, 'groceries', 'Migros'],
    [0, 4, 'gaTravelcard', 340, 'transport', 'SBB'],
    [0, 6, 'lunchClient', 58.5, 'dining', 'Restaurant Schiff'],
    [0, 8, 'adobe', 65.45, 'software', 'Adobe'],
    [0, 9, 'coopGroceries', 64.2, 'groceries', 'Coop'],
    [0, 11, 'electricity', 112.3, 'utilities', 'CKW'],
    [0, 12, 'physio', 120, 'health', 'Physio Zentrum'],
    [0, 14, 'dinnerOut', 96, 'dining', 'Trattoria Da Vinci'],
    [0, 16, 'petrol', 78.9, 'transport', 'Socar'],
    [0, 18, 'mobilePlan', 39, 'utilities', 'Salt'],
    [0, 20, 'githubTeam', 36, 'software', 'GitHub'],
    [0, 22, 'migrosWeekly', 91.15, 'groceries', 'Migros'],
    [0, 24, 'officeChair', 489, 'office', 'Pfister'],
    // prior months, give the trend bars some shape
    [1, 5, 'rentLuzern', 1650, 'rent', 'Hausverwaltung Meier'],
    [1, 12, 'groceries', 312.6, 'groceries', 'Migros'],
    [1, 18, 'trainTickets', 154, 'transport', 'SBB'],
    [1, 24, 'softwareSubs', 101.45, 'software', 'Adobe'],
    [2, 5, 'rentLuzern', 1650, 'rent', 'Hausverwaltung Meier'],
    [2, 14, 'groceries', 289.3, 'groceries', 'Coop'],
    [2, 20, 'dentist', 240, 'health', 'Dr. Frei'],
    [3, 5, 'rentLuzern', 1650, 'rent', 'Hausverwaltung Meier'],
    [3, 16, 'groceries', 276.85, 'groceries', 'Migros'],
    [4, 5, 'rentLuzern', 1650, 'rent', 'Hausverwaltung Meier'],
    [4, 19, 'groceries', 301.2, 'groceries', 'Coop'],
    [5, 5, 'rentLuzern', 1650, 'rent', 'Hausverwaltung Meier'],
    [5, 21, 'groceries', 268.4, 'groceries', 'Migros']
  ]
  for (const [m, d, titleKey, amount, c, vendor] of expenses) {
    insertExpense.run(S.exp[titleKey as keyof typeof S.exp], chf(amount), day(m, d), cat[c], vendor, null)
  }

  // --- Income sources ---------------------------------------------------
  const insertSource = db.prepare(
    `INSERT INTO income_sources (company, job_title, salary_rappen, currency, payout_day, canton, payout_rule)
     VALUES (?, ?, ?, 'CHF', ?, ?, ?)`
  )
  const helvetia = insertSource.run(
    'Helvetia Versicherungen',
    S.job.swEngineer,
    chf(6800),
    25,
    'LU',
    'earlier'
  ).lastInsertRowid
  const studio = insertSource.run(
    'Studio Nord (freelance)',
    S.job.uxConsulting,
    chf(2400),
    30,
    'ZH',
    'later'
  ).lastInsertRowid

  const insertPayment = db.prepare(
    'INSERT INTO income_payments (source_id, month, date, amount_rappen) VALUES (?, ?, ?, ?)'
  )
  // Salary recorded for every past month; freelance for most. Current month: salary
  // received, freelance still pending (left unrecorded) for a realistic mixed state.
  for (const m of months) {
    insertPayment.run(helvetia, m, `${m}-25`, chf(6800))
    if (m !== months[months.length - 1]) insertPayment.run(studio, m, `${m}-30`, chf(2400))
  }

  // --- Sender (your business identity) ----------------------------------
  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
  db.prepare(
    `UPDATE sender SET type='company', name='chohle GmbH', street='Bahnhofstrasse 12',
       zip='6003', city='Luzern', country='CH', email='hello@chohle.ch', phone='+41 41 555 12 34',
       website='chohle.ch', iban='CH93 0076 2011 6238 5295 7', uid='CHE-123.456.789',
       mwst='CHE-123.456.789 MWST', hr_number='CH-100.4.789.012-3', founding_year=2021,
       vat_registered=1 WHERE id=1`
  ).run()

  // --- Customers --------------------------------------------------------
  // Customer document language follows the seed locale so generated invoice and
  // quote PDFs come out in the same language as the rest of the demo data.
  const insertCustomer = db.prepare(
    `INSERT INTO customers (type, name, contact_person, email, phone, street, zip, city, country,
       language, customer_number, price_category, discount_percent, payment_term_days, website,
       founding_year, uid, mwst)
     VALUES (@type, @name, @contact, @email, @phone, @street, @zip, @city, 'CH', @lang, @num,
       @price, @discount, @term, @website, @founded, @uid, @mwst)`
  )
  const customers = [
    {
      type: 'company', name: 'Müller Bau AG', contact: 'Thomas Müller',
      email: 'info@muellerbau.ch', phone: '+41 41 210 44 55', street: 'Industriestrasse 8',
      zip: '6010', city: 'Kriens', lang: locale, num: 'K-1001', price: 'Standard',
      discount: 0, term: 30, website: 'muellerbau.ch', founded: 1998,
      uid: 'CHE-201.345.678', mwst: 'CHE-201.345.678 MWST'
    },
    {
      type: 'company', name: 'Café Zentral GmbH', contact: 'Sandra Bucher',
      email: 'sandra@cafezentral.ch', phone: '+41 41 410 22 33', street: 'Hirschmattstrasse 3',
      zip: '6003', city: 'Luzern', lang: locale, num: 'K-1002', price: 'Standard',
      discount: 5, term: 14, website: 'cafezentral.ch', founded: 2015,
      uid: 'CHE-310.222.444', mwst: ''
    },
    {
      type: 'person', name: 'Anna Keller', contact: '',
      email: 'anna.keller@bluewin.ch', phone: '+41 79 333 21 10', street: 'Weinbergstrasse 41',
      zip: '8006', city: 'Zürich', lang: locale, num: 'K-1003', price: '',
      discount: 0, term: 30, website: '', founded: null, uid: '', mwst: ''
    },
    {
      type: 'company', name: 'Studio Nord GmbH', contact: 'Luca Rossi',
      email: 'luca@studionord.ch', phone: '+41 44 500 90 00', street: 'Limmatstrasse 264',
      zip: '8005', city: 'Zürich', lang: locale, num: 'K-1004', price: 'Premium',
      discount: 10, term: 30, website: 'studionord.ch', founded: 2012,
      uid: 'CHE-444.555.666', mwst: 'CHE-444.555.666 MWST'
    },
    {
      type: 'company', name: 'Tech Hub AG', contact: 'Mira Holzer',
      email: 'mira@techhub.ch', phone: '+41 44 333 12 12', street: 'Europaallee 21',
      zip: '8004', city: 'Zürich', lang: locale, num: 'K-1005', price: 'Standard',
      discount: 0, term: 30, website: 'techhub.ch', founded: 2019,
      uid: 'CHE-555.666.777', mwst: 'CHE-555.666.777 MWST'
    },
    {
      type: 'person', name: 'Marina Sturm', contact: '',
      email: 'marina.sturm@gmx.ch', phone: '+41 78 444 55 66', street: 'Bahnhofplatz 4',
      zip: '6300', city: 'Zug', lang: locale, num: 'K-1006', price: '',
      discount: 0, term: 30, website: '', founded: null, uid: '', mwst: ''
    }
  ]
  const customerIds = customers.map((c) => insertCustomer.run(c).lastInsertRowid)
  const [muellerId, cafeId, annaId, studioId, techhubId, marinaId] = customerIds

  // --- Articles ---------------------------------------------------------
  const insertArticle = db.prepare(
    `INSERT INTO articles (name, unit, default_price_rappen, default_mwst, customer_id)
     VALUES (?, ?, ?, ?, ?)`
  )
  const art: Record<string, number | bigint> = {}
  // [articleKey, unitKey, price, mwst]
  const articles: [keyof typeof S.art, keyof typeof S.units, number, number][] = [
    ['consulting', 'hours', 150, 8.1],
    ['maintenance', 'hours', 120, 8.1],
    ['webdesign', 'flat', 2500, 8.1],
    ['hosting', 'month', 25, 8.1],
    ['expenses', 'flat', 0, 8.1]
  ]
  for (const [key, unitKey, price, mwst] of articles) {
    art[key] = insertArticle.run(S.art[key], S.units[unitKey], chf(price), mwst, null).lastInsertRowid
  }
  // Customer specific articles so customer detail pages have bespoke items.
  insertArticle.run(S.art.retainer, S.units.month, chf(800), 8.1, studioId)
  insertArticle.run(S.art.express, S.units.flat, chf(200), 8.1, studioId)
  insertArticle.run(S.art.cleaning, S.units.flat, chf(450), 8.1, muellerId)

  // --- Projects (Sales + Procurement) -----------------------------------
  const insertProject = db.prepare(
    `INSERT INTO projects (name, customer_id, direction, stage, label, budget_rappen,
                            budget_type, due_date, notes, position, email, phone,
                            created_at, updated_at)
     VALUES (@name, @customer_id, @direction, @stage, @label, @budget_rappen,
             @budget_type, @due_date, @notes, @position, @email, @phone,
             @created_at, @updated_at)`
  )
  const projectAt = (offset: number, dd: number) => day(offset, dd) + ' 09:00:00'

  // Stable `key` selects the translated name/label/notes from S.proj and lets us
  // look projects up by name-independent identity further down.
  const projectDefs = [
    // SALES: lead stage (x2)
    { key: 'webshop', customer_id: techhubId, direction: 'sales', stage: 'lead', budget_rappen: chf(8500), budget_type: 'fixed', due_date: day(0, 28), position: 0, email: 'mira@techhub.ch', phone: '+41 44 333 12 12', created_at: projectAt(0, 5), updated_at: projectAt(0, 12) },
    { key: 'logoCi', customer_id: marinaId, direction: 'sales', stage: 'lead', budget_rappen: chf(1500), budget_type: 'fixed', due_date: null, position: 1, email: 'marina.sturm@gmx.ch', phone: '+41 78 444 55 66', created_at: projectAt(0, 8), updated_at: projectAt(0, 9) },
    // SALES: contacted (x1)
    { key: 'booking', customer_id: cafeId, direction: 'sales', stage: 'contacted', budget_rappen: chf(4500), budget_type: 'fixed', due_date: day(1, 15), position: 0, email: 'sandra@cafezentral.ch', phone: '+41 41 410 22 33', created_at: projectAt(1, 22), updated_at: projectAt(0, 3) },
    // SALES: proposal (x1) with email thread
    { key: 'marketing', customer_id: muellerId, direction: 'sales', stage: 'proposal', budget_rappen: chf(6000), budget_type: 'fixed', due_date: day(1, 10), position: 0, email: 'info@muellerbau.ch', phone: '+41 41 210 44 55', created_at: projectAt(1, 18), updated_at: projectAt(0, 6) },
    // SALES: won (x1) -> has a paid invoice
    { key: 'maintContract', customer_id: muellerId, direction: 'sales', stage: 'won', budget_rappen: chf(12000), budget_type: 'hourly', due_date: day(0, 6), position: 0, email: 'info@muellerbau.ch', phone: '+41 41 210 44 55', created_at: projectAt(3, 14), updated_at: projectAt(2, 6) },
    // SALES: active (x2) -> currently being worked on
    { key: 'relaunch', customer_id: studioId, direction: 'sales', stage: 'active', budget_rappen: chf(18000), budget_type: 'fixed', due_date: day(-1, 30), position: 0, email: 'luca@studionord.ch', phone: '+41 44 500 90 00', created_at: projectAt(2, 1), updated_at: projectAt(0, 10) },
    { key: 'consultingQ1', customer_id: cafeId, direction: 'sales', stage: 'active', budget_rappen: chf(5000), budget_type: 'hourly', due_date: day(-2, 31), position: 1, email: 'sandra@cafezentral.ch', phone: '+41 41 410 22 33', created_at: projectAt(2, 8), updated_at: projectAt(0, 4) },
    // SALES: completed (x1) -> archived
    { key: 'audit', customer_id: annaId, direction: 'sales', stage: 'completed', budget_rappen: chf(800), budget_type: 'fixed', due_date: day(3, 20), position: 0, email: 'anna.keller@bluewin.ch', phone: '+41 79 333 21 10', created_at: projectAt(4, 1), updated_at: projectAt(3, 22) },
    // PROCUREMENT: need
    { key: 'laptops', customer_id: null, direction: 'procurement', stage: 'need', budget_rappen: chf(9000), budget_type: 'estimate', due_date: day(0, 30), position: 0, email: '', phone: '', created_at: projectAt(0, 2), updated_at: projectAt(0, 2) },
    // PROCUREMENT: requested
    { key: 'cleaningQuotes', customer_id: null, direction: 'procurement', stage: 'requested', budget_rappen: chf(2400), budget_type: 'estimate', due_date: day(0, 25), position: 0, email: '', phone: '', created_at: projectAt(0, 4), updated_at: projectAt(0, 7) },
    // PROCUREMENT: received
    { key: 'hostingCompare', customer_id: null, direction: 'procurement', stage: 'received', budget_rappen: chf(600), budget_type: 'estimate', due_date: null, position: 0, email: '', phone: '', created_at: projectAt(1, 12), updated_at: projectAt(0, 9) },
    // PROCUREMENT: accepted
    { key: 'furniture', customer_id: null, direction: 'procurement', stage: 'accepted', budget_rappen: chf(3200), budget_type: 'fixed', due_date: day(0, 22), position: 0, email: 'kontakt@pfister.ch', phone: '+41 44 500 11 22', created_at: projectAt(1, 28), updated_at: projectAt(0, 15) }
  ]
  // Expand each def into the exact named params the insert expects, pulling the
  // localized name/label/notes out of S.proj. (Keeping `key` off the bound
  // object avoids better-sqlite3 complaining about an unused parameter.)
  const toProjectRow = (d: { key: string } & Record<string, unknown>) => ({
    name: S.proj[d.key as keyof typeof S.proj].name,
    customer_id: d.customer_id,
    direction: d.direction,
    stage: d.stage,
    label: S.proj[d.key as keyof typeof S.proj].label,
    budget_rappen: d.budget_rappen,
    budget_type: d.budget_type,
    due_date: d.due_date,
    notes: S.proj[d.key as keyof typeof S.proj].notes,
    position: d.position,
    email: d.email,
    phone: d.phone,
    created_at: d.created_at,
    updated_at: d.updated_at
  })
  const projectIds = projectDefs.map((d) => insertProject.run(toProjectRow(d)).lastInsertRowid)
  const projectIdByKey = (key: string) => projectIds[projectDefs.findIndex((d) => d.key === key)]

  // Pick a few project ids out by stable key for the email thread + invoice linking.
  const proposalProjectId = projectIdByKey('marketing')
  const wonProjectId = projectIdByKey('maintContract')
  const activeProjectId = projectIdByKey('relaunch')
  const completedProjectId = projectIdByKey('audit')

  // --- Project email thread (on the proposal stage project) -------------
  const insertEmail = db.prepare(
    `INSERT INTO project_emails (project_id, direction, from_address, to_address,
                                  subject, body_html, body_text, sent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  insertEmail.run(
    proposalProjectId, 'outbound', 'hello@chohle.ch', 'info@muellerbau.ch',
    S.email.subj1, htmlFromText(S.email.text1), S.email.text1,
    day(0, 6) + ' 10:32:00', day(0, 6) + ' 10:32:00'
  )
  insertEmail.run(
    proposalProjectId, 'inbound', 'info@muellerbau.ch', null,
    'Re: ' + S.email.subj1, '', S.email.text2,
    day(0, 8) + ' 14:18:00', day(0, 8) + ' 14:18:00'
  )

  // --- Invoices (some linked to projects) -------------------------------
  const insertInvoice = db.prepare(
    `INSERT INTO invoices (customer_id, project_id, number, title, status, issue_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const insertItem = db.prepare(
    `INSERT INTO invoice_items
       (invoice_id, article_id, description, quantity, unit, unit_price_rappen, discount_percent, mwst_percent, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  type Item = { article?: number | bigint | null; desc: string; qty: number; unit?: string; price: number; discount?: number; mwst?: number }
  const addInvoice = (
    customerId: number | bigint,
    projectId: number | bigint,
    number: string,
    title: string,
    status: string,
    issueOffset: number,
    items: Item[]
  ) => {
    const issue = day(issueOffset, 6)
    const dueD = new Date(now.getFullYear(), now.getMonth() - issueOffset, 6 + 30)
    const due = `${dueD.getFullYear()}-${String(dueD.getMonth() + 1).padStart(2, '0')}-${String(dueD.getDate()).padStart(2, '0')}`
    const id = insertInvoice.run(customerId, projectId, number, title, status, issue, due).lastInsertRowid
    items.forEach((it, i) => {
      insertItem.run(id, it.article ?? null, it.desc, it.qty, it.unit ?? '', chf(it.price), it.discount ?? 0, it.mwst ?? 8.1, i)
    })
  }

  // Each invoice belongs to a project. Older invoices get small completed
  // projects so the customer history is preserved without orphans.
  const legacyHeatingId = insertProject.run(
    toProjectRow({ key: 'legacyHeating', customer_id: muellerId, direction: 'sales', stage: 'completed', budget_rappen: chf(1000), budget_type: 'fixed', due_date: day(5, 6), position: 1, email: 'info@muellerbau.ch', phone: '+41 41 210 44 55', created_at: projectAt(5, 1), updated_at: projectAt(5, 8) })
  ).lastInsertRowid
  addInvoice(muellerId, legacyHeatingId, '2025-101', S.inv.t101, 'paid', 5, [
    { article: art.maintenance, desc: S.desc.maintenanceWork, qty: 8, unit: S.units.hours, price: 120 },
    { article: art.expenses, desc: S.desc.travel, qty: 1, unit: S.units.flat, price: 45 }
  ])

  // Won project: 1 paid invoice
  addInvoice(muellerId, wonProjectId, '2026-001', S.inv.t001, 'paid', 2, [
    { article: art.maintenance, desc: S.desc.maintQ1, qty: 24, unit: S.units.hours, price: 120 },
    { article: art.expenses, desc: S.desc.travels, qty: 1, unit: S.units.flat, price: 145 }
  ])

  // Active project: 1 paid invoice + 1 sent (awaiting payment) + 1 draft
  addInvoice(studioId, activeProjectId, '2026-002', S.inv.t002, 'paid', 1, [
    { article: art.webdesign, desc: S.desc.conceptDesign, qty: 1, unit: S.units.flat, price: 6000 },
    { article: art.consulting, desc: S.desc.stakeholderWorkshops, qty: 8, unit: S.units.hours, price: 150 }
  ])
  addInvoice(studioId, activeProjectId, '2026-003', S.inv.t003, 'sent', 0, [
    { article: art.webdesign, desc: S.desc.implSprint1, qty: 1, unit: S.units.flat, price: 4500 },
    { article: art.consulting, desc: S.desc.reviewsIterations, qty: 6, unit: S.units.hours, price: 150 }
  ])
  addInvoice(studioId, activeProjectId, '2026-004', S.inv.t004, 'draft', 0, [
    { article: art.webdesign, desc: S.desc.implSprint2, qty: 1, unit: S.units.flat, price: 4500 }
  ])

  // Completed project: paid invoice, archived
  addInvoice(annaId, completedProjectId, '2025-099', S.inv.t099, 'paid', 3, [
    { article: art.consulting, desc: S.desc.auditReport, qty: 4, unit: S.units.hours, price: 150 },
    { article: art.expenses, desc: S.desc.toolLicenses, qty: 1, unit: S.units.flat, price: 200 }
  ])

  // Quick draft invoice tied to a tiny "consulting" project for Café Zentral.
  const quickConsultingId = insertProject.run(
    toProjectRow({ key: 'quickConsulting', customer_id: cafeId, direction: 'sales', stage: 'active', budget_rappen: chf(600), budget_type: 'hourly', due_date: day(0, 28), position: 2, email: 'sandra@cafezentral.ch', phone: '+41 41 410 22 33', created_at: projectAt(0, 4), updated_at: projectAt(0, 5) })
  ).lastInsertRowid
  addInvoice(cafeId, quickConsultingId, '2026-005', S.inv.t005, 'draft', 0, [
    { article: art.consulting, desc: S.desc.consulting, qty: 4, unit: S.units.hours, price: 150, discount: 5 }
  ])

  // --- Quotes (Offerten) ------------------------------------------------
  // One per status so the /quotes page shows the full workflow:
  // draft / sent / accepted (ready to convert) / converted (already linked
  // to an invoice) / declined.
  const insertQuote = db.prepare(
    `INSERT INTO quotes (customer_id, project_id, number, title, status,
                         issue_date, valid_until, converted_invoice_id,
                         accepted_at, declined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertQuoteItem = db.prepare(
    `INSERT INTO quote_items
       (quote_id, article_id, description, quantity, unit, unit_price_rappen,
        discount_percent, mwst_percent, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const addQuote = (
    customerId: number | bigint,
    projectId: number | bigint | null,
    number: string,
    title: string,
    status: string,
    issueOffset: number,
    validityDays: number,
    items: Item[],
    extras: { convertedInvoiceId?: number | bigint; acceptedAt?: string; declinedAt?: string } = {}
  ) => {
    const issue = day(issueOffset, 6)
    const vd = new Date(now.getFullYear(), now.getMonth() - issueOffset, 6 + validityDays)
    const validUntil = `${vd.getFullYear()}-${String(vd.getMonth() + 1).padStart(2, '0')}-${String(vd.getDate()).padStart(2, '0')}`
    const id = insertQuote.run(
      customerId, projectId, number, title, status, issue, validUntil,
      extras.convertedInvoiceId ?? null, extras.acceptedAt ?? null, extras.declinedAt ?? null
    ).lastInsertRowid
    items.forEach((it, i) => {
      insertQuoteItem.run(id, it.article ?? null, it.desc, it.qty, it.unit ?? '', chf(it.price), it.discount ?? 0, it.mwst ?? 8.1, i)
    })
    return id
  }

  // Sent: waiting on the studio's "Marketing site" project proposal.
  addQuote(studioId, proposalProjectId, 'Q-2026-001', S.quo.q1, 'sent', 0, 30, [
    { article: art.webdesign, desc: S.desc.conceptWireframes, qty: 1, unit: S.units.flat, price: 7500 },
    { article: art.consulting, desc: S.desc.stakeholderWorkshops, qty: 12, unit: S.units.hours, price: 150 }
  ])

  // Accepted (ready to convert): cafe wants more consulting.
  addQuote(cafeId, quickConsultingId, 'Q-2026-002', S.quo.q2, 'accepted', 0, 30, [
    { article: art.consulting, desc: S.desc.workshopSupport, qty: 10, unit: S.units.hours, price: 150 },
    { article: art.expenses, desc: S.desc.travels, qty: 1, unit: S.units.flat, price: 60 }
  ], { acceptedAt: day(0, 12) })

  // Draft: brand new, not sent yet. No project link to demo the "no project"
  // guard on the Convert button.
  addQuote(annaId, null, 'Q-2026-003', S.quo.q3, 'draft', 0, 30, [
    { article: art.webdesign, desc: S.desc.logoVariations, qty: 1, unit: S.units.flat, price: 1800 },
    { article: art.consulting, desc: S.desc.strategyTalk, qty: 3, unit: S.units.hours, price: 150 }
  ])

  // Declined: customer said no. Surfaces under the Declined filter.
  addQuote(techhubId, null, 'Q-2025-099', S.quo.q4, 'declined', 2, 14, [
    { article: art.consulting, desc: S.desc.auditReport, qty: 16, unit: S.units.hours, price: 150 }
  ], { declinedAt: day(2, 20) })

  // Already converted: this quote turned into invoice 2026-002 (the studio's
  // Website relaunch phase 1). Surfaces with a "Converted to ..." banner and
  // no Convert button.
  const phase1InvoiceId = (db.prepare("SELECT id FROM invoices WHERE number = '2026-002'").get() as { id: number }).id
  addQuote(studioId, activeProjectId, 'Q-2026-000', S.quo.q0, 'accepted', 1, 30, [
    { article: art.webdesign, desc: S.desc.conceptDesign, qty: 1, unit: S.units.flat, price: 6000 },
    { article: art.consulting, desc: S.desc.stakeholderWorkshops, qty: 8, unit: S.units.hours, price: 150 }
  ], { convertedInvoiceId: phase1InvoiceId, acceptedAt: day(1, 6) })

  // --- UI language ------------------------------------------------------
  // Point the owner's stored locale at the seeded language so the app opens in
  // the same language as the demo data. Guarded for very old DBs without the
  // owner.locale column.
  try {
    db.prepare('UPDATE owner SET locale = ? WHERE id = 1').run(locale)
  } catch {
    // owner.locale column not present yet; skip.
  }

  // 2 extra projects are inserted later (legacyHeating + quickConsulting).
  return {
    locale,
    categories: categories.length,
    expenses: expenses.length,
    customers: customers.length,
    articles: articles.length + 3,
    projects: projectDefs.length + 2,
    invoices: 7,
    quotes: 5
  }
}
