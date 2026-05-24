import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'
import type { H3Event } from 'h3'

export function uploadsDir(): string {
  const dir = process.env.UPLOADS_PATH || 'data/uploads'
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

export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml'
]

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf'
}

// Reads a single uploaded image from a multipart request, stores it, returns the name.
export async function saveImageUpload(event: H3Event): Promise<string> {
  const parts = await readMultipartFormData(event)
  const file = (parts ?? []).find((p) => p.filename && p.data?.length)
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'No file' })
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type ?? '')) {
    throw createError({ statusCode: 415, statusMessage: `Unsupported image type: ${file.type}` })
  }
  const storedName = `${randomUUID()}${extname(file.filename!)}`
  await writeFile(join(uploadsDir(), storedName), file.data)
  return storedName
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
  setHeader(event, 'Content-Type', CONTENT_TYPES[extname(storedName).toLowerCase()] ?? 'application/octet-stream')
  return sendStream(event, createReadStream(path))
}
