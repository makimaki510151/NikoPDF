export const COMMENT_COLORS = Object.freeze([
  '#ffffff',
  '#ff5b5b',
  '#ff9d32',
  '#ffe45c',
  '#6ee37a',
  '#5ad7ff',
  '#9eb6ff',
  '#ff8ad4',
])

export const MAX_COMMENT = 50
export const MAX_NAME = 12
export const MAX_PDF_BYTES = 32 * 1024 * 1024

const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function cleanText(value, max) {
  if (typeof value !== 'string') return ''
  let normalized = ''
  for (const char of value) {
    const code = char.codePointAt(0)
    if (code === 9 || code === 10 || code === 13) {
      normalized += ' '
      continue
    }
    if (code < 32 || code === 127) continue
    if (code >= 0x200b && code <= 0x200d) continue
    if (code === 0xfeff) continue
    normalized += char
  }
  return Array.from(normalized.replace(/ {2,}/g, ' ').trim()).slice(0, max).join('')
}

export function cleanFileName(name) {
  const base = String(name || 'slides.pdf').split(/[/\\]/).pop()
  return cleanText(base, 80) || 'slides.pdf'
}

export function normalizeColor(color) {
  return COMMENT_COLORS.includes(color) ? color : COMMENT_COLORS[0]
}

export function isPdf(bytes) {
  return bytes instanceof Uint8Array
    && bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
}

export function createRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let id = ''
  for (const byte of bytes) id += ROOM_ALPHABET[byte % ROOM_ALPHABET.length]
  return id
}

export function isRoomId(id) {
  return /^[a-z0-9]{8}$/.test(id)
}

export function clampPage(value) {
  const number = Math.floor(Number(value))
  if (!Number.isFinite(number)) return 1
  return Math.min(9999, Math.max(1, number))
}
