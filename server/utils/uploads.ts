import { mkdirSync } from 'node:fs'

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
