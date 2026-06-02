// Demo mode: every visitor gets an isolated, per-session sandbox database so
// they only ever see their own changes and can't affect anyone else. Enabled
// with CHOHLE_DEMO=true; a no-op otherwise (the app stays single-tenant).
//
// Each session id (a cookie) maps to its own SQLite file, copied from a
// pristine per-locale template (migrated + seeded). Open handles are cached and
// evicted when idle. See server/middleware (wiring) and db.ts (resolution).

import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { runMigrations } from './migrate'
import { seedDemo } from './seedDemo'

export function isDemo(): boolean {
  return process.env.CHOHLE_DEMO === 'true'
}

export const DEMO_COOKIE = 'demo_sid'
export const DEMO_LOCALES = ['en', 'de', 'fr', 'it'] as const
const DEFAULT_LOCALE = 'en'

const SESSION_TTL_MS = Number(process.env.DEMO_SESSION_TTL_MS) || 2 * 60 * 60 * 1000
const MAX_SESSIONS = Number(process.env.DEMO_MAX_SESSIONS) || 500

export function normLocale(locale: string | undefined | null): string {
  return locale && (DEMO_LOCALES as readonly string[]).includes(locale) ? locale : DEFAULT_LOCALE
}

export function newSessionId(): string {
  return randomUUID().replace(/-/g, '')
}

// Per-session and template dbs live here — must be a writable, fast-local dir
// (a Docker named volume), never a macOS bind mount (SQLite corrupts there).
function demoRoot(): string {
  const root = process.env.DEMO_DATA_PATH || 'data/demo'
  mkdirSync(root, { recursive: true })
  return root
}
function templatesDir(): string {
  const d = join(demoRoot(), 'templates')
  mkdirSync(d, { recursive: true })
  return d
}
function sessionsDir(): string {
  const d = join(demoRoot(), 'sessions')
  mkdirSync(d, { recursive: true })
  return d
}

function removeDbFiles(path: string): void {
  for (const p of [path, `${path}-wal`, `${path}-shm`]) rmSync(p, { force: true })
}

// --- templates ------------------------------------------------------------
// One pristine db per locale, built once and copied per session — a file copy
// is far cheaper than re-running migrations + seed on every visit.

function templatePath(locale: string): string {
  return join(templatesDir(), `${locale}.db`)
}

function buildTemplate(locale: string): void {
  const path = templatePath(locale)
  if (existsSync(path)) return

  const tmp = `${path}.building`
  removeDbFiles(tmp)
  const db = new Database(tmp)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    // Owner so the app has an account to "log in" as; password is never used
    // (demo auto-logins). Then the localized demo content.
    db.prepare(
      "INSERT OR IGNORE INTO owner (id, username, password_hash) VALUES (1, 'demo', '')"
    ).run()
    db.prepare('UPDATE owner SET locale = ? WHERE id = 1').run(locale)
    seedDemo(db, locale)
    db.close()
    copyFileSync(tmp, path) // publish atomically-ish once fully built
  } finally {
    removeDbFiles(tmp)
  }
}

// --- session databases ----------------------------------------------------

interface Session {
  db: Database.Database
  locale: string
  lastAccess: number
}
const sessions = new Map<string, Session>()

function sessionPath(sid: string): string {
  return join(sessionsDir(), `${sid}.db`)
}

function openSessionDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

/** Resolve (or create) the database for a session, in the given locale. */
export function resolveSessionDb(sid: string, locale: string): Database.Database {
  const cached = sessions.get(sid)
  if (cached) {
    cached.lastAccess = Date.now()
    return cached.db
  }

  evictIdle()
  if (sessions.size >= MAX_SESSIONS) evictOldest()

  const norm = normLocale(locale)
  buildTemplate(norm)
  const path = sessionPath(sid)
  if (!existsSync(path)) copyFileSync(templatePath(norm), path)

  const db = openSessionDb(path)
  sessions.set(sid, { db, locale: norm, lastAccess: Date.now() })
  return db
}

/** Wipe a session back to a fresh template in the given locale. */
export function resetSessionDb(sid: string, locale: string): void {
  closeSession(sid)
  removeDbFiles(sessionPath(sid))
  const norm = normLocale(locale)
  buildTemplate(norm)
  copyFileSync(templatePath(norm), sessionPath(sid))
  // Reopened lazily on the next request via resolveSessionDb.
}

function closeSession(sid: string): void {
  const s = sessions.get(sid)
  if (!s) return
  try {
    s.db.close()
  } catch {
    /* already closed */
  }
  sessions.delete(sid)
}

function evictIdle(): void {
  const now = Date.now()
  for (const [sid, s] of sessions) {
    if (now - s.lastAccess > SESSION_TTL_MS) {
      closeSession(sid)
      removeDbFiles(sessionPath(sid))
    }
  }
}

function evictOldest(): void {
  let oldest: { sid: string; t: number } | null = null
  for (const [sid, s] of sessions) {
    if (!oldest || s.lastAccess < oldest.t) oldest = { sid, t: s.lastAccess }
  }
  if (oldest) {
    closeSession(oldest.sid)
    removeDbFiles(sessionPath(oldest.sid))
  }
}
