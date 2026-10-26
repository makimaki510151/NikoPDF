import { isRoomId } from './text.js'

export function computeBase(pathname) {
  const parts = String(pathname || '/').split('/').filter(Boolean)
  const last = parts[parts.length - 1]
  let cut = 0
  if (last === 'host' || last === 'view') cut = 2
  else if (last === 'index.html' || last === '404.html') cut = 1
  const baseParts = parts.slice(0, Math.max(0, parts.length - cut))
  return baseParts.length ? `/${baseParts.join('/')}/` : '/'
}

export function parseRoute(pathname, base) {
  const path = stripBase(pathname, base)
  if (!path || path === 'index.html' || path === '404.html') return { name: 'home' }
  const match = path.match(/^([a-zA-Z0-9]{8})\/(host|view)$/)
  if (!match) return { name: 'home', invalid: true }
  return { name: 'room', roomId: match[1].toLowerCase(), role: match[2] }
}

export function parseJoinInput(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.includes('://')) {
    try {
      const url = new URL(raw)
      const parts = url.pathname.split('/').filter(Boolean)
      const role = parts.at(-1)
      if ((role === 'host' || role === 'view') && parts.length >= 2) {
        const roomId = parts.at(-2).toLowerCase()
        if (isRoomId(roomId)) return { roomId, role }
      }
    } catch {
      return null
    }
  }
  const inline = raw.match(/([a-zA-Z0-9]{8})\/(host|view)\/?$/)
  if (inline) return { roomId: inline[1].toLowerCase(), role: inline[2] }
  const roomId = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!isRoomId(roomId)) return null
  return { roomId, role: 'view' }
}

function stripBase(pathname, base) {
  const safeBase = base || '/'
  let path = pathname || '/'
  if (safeBase === '/') return path.replace(/^\/+|\/+$/g, '')
  const prefix = safeBase.endsWith('/') ? safeBase.slice(0, -1) : safeBase
  if (path === prefix || path === `${prefix}/`) return ''
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length + 1).replace(/\/+$/g, '')
  return path.replace(/^\/+|\/+$/g, '')
}
