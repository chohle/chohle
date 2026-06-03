import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import type { H3Event } from 'h3'

export function uploadsDir(): string {
  const dir = process.env.UPLOADS_PATH || 'data/uploads'
  mkdirSync(dir, { recursive: true })
  return dir
}

// Editor/email images live in their own subdirectory and are the ONLY uploads
// served publicly (so private receipts in uploadsDir() are never exposed by a
// guessed name). Referenced by absolute URL from sent emails.
export function emailAssetsDir(): string {
  const dir = join(uploadsDir(), 'email')
  mkdirSync(dir, { recursive: true })
  return dir
}

export const ALLOWED_RECEIPT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]

// SVG is intentionally excluded: it can carry inline <script>/onload that
// executes when the file is opened directly, and these uploads are served
// from the app's own origin. Raster formats cover the logo use case.
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf'
}

// The 8-byte PNG signature. Used to confirm a file claiming to be a PNG really
// is one, so a renamed/mislabelled image can't get stored and then render
// broken where we embed it (e.g. the invoice logo in the printed PDF).
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// Reads a single uploaded image from a multipart request, stores it, returns
// the name. Pass `allowedTypes` to narrow the accepted formats — e.g. the
// company logo is PNG-only so it reproduces cleanly (with transparency) in the
// invoice PDF; the default covers the broader raster set for other uploads.
export async function saveImageUpload(
  event: H3Event,
  allowedTypes: readonly string[] = ALLOWED_IMAGE_TYPES
): Promise<string> {
  const parts = await readMultipartFormData(event)
  const file = (parts ?? []).find((p) => p.filename && p.data?.length)
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'No file' })
  }
  if (!allowedTypes.includes(file.type ?? '')) {
    throw createError({ statusCode: 415, statusMessage: `Unsupported image type: ${file.type}` })
  }
  // Don't trust the client-declared type for PNG — verify the magic bytes.
  if (file.type === 'image/png' && !file.data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw createError({ statusCode: 415, statusMessage: 'File is not a valid PNG image' })
  }
  const storedName = `${randomUUID()}${extname(file.filename!)}`
  await writeFile(join(uploadsDir(), storedName), file.data)
  return storedName
}

// Read a stored upload into a buffer for embedding (e.g. the sender logo in the
// invoice/quote PDF). Returns null when unset or missing, so a gone file never
// breaks the consumer.
export async function readUpload(storedName: string | null | undefined): Promise<Buffer | null> {
  if (!storedName) return null
  const path = join(uploadsDir(), storedName)
  if (!existsSync(path)) return null
  try {
    return await readFile(path)
  } catch {
    return null
  }
}

export async function deleteUpload(storedName: string | null | undefined): Promise<void> {
  if (!storedName) return
  await rm(join(uploadsDir(), storedName), { force: true })
}

export function serveUpload(event: H3Event, storedName: string | null | undefined) {
  if (!storedName) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const path = join(uploadsDir(), storedName)
  if (!existsSync(path)) {
    throw createError({ statusCode: 404, statusMessage: 'File missing' })
  }
  setHeader(
    event,
    'Content-Type',
    CONTENT_TYPES[extname(storedName).toLowerCase()] ?? 'application/octet-stream'
  )
  // Don't let the browser MIME-sniff a stored file into an executable type.
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return sendStream(event, createReadStream(path))
}

// Cap on editor-pasted images so a giant file can't be inlined into the request
// buffer / stored unbounded.
const MAX_EMAIL_IMAGE_BYTES = 5 * 1024 * 1024

// Save an image dropped/picked in the email editor into the public email-asset
// store; returns the stored name (uuid.ext). Validates type + size.
export async function saveEmailImage(event: H3Event): Promise<string> {
  const parts = await readMultipartFormData(event)
  const file = (parts ?? []).find((p) => p.filename && p.data?.length)
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'No file' })
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type ?? '')) {
    throw createError({ statusCode: 415, statusMessage: `Unsupported image type: ${file.type}` })
  }
  if (file.data.length > MAX_EMAIL_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image too large (max 5 MB)' })
  }
  if (file.type === 'image/png' && !file.data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw createError({ statusCode: 415, statusMessage: 'File is not a valid PNG image' })
  }
  const storedName = `${randomUUID()}${extname(file.filename!)}`
  await writeFile(join(emailAssetsDir(), storedName), file.data)
  return storedName
}

// Serve a public email asset by name. basename() strips any path so the name
// from the URL can't escape the email subdirectory.
export function serveEmailAsset(event: H3Event, name: string | null | undefined) {
  const safe = name ? basename(name) : ''
  const path = safe && join(emailAssetsDir(), safe)
  if (!path || !existsSync(path)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  setHeader(
    event,
    'Content-Type',
    CONTENT_TYPES[extname(safe).toLowerCase()] ?? 'application/octet-stream'
  )
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return sendStream(event, createReadStream(path))
}
