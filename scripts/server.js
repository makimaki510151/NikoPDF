import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}

export function startServer({ root = process.cwd(), port = 4173 } = {}) {
  const rootPath = path.resolve(root)
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith('/') && pathname !== '/') pathname = pathname.slice(0, -1)
    if (isBlocked(pathname)) return send(response, 404, 'not found')
    const filePath = safePath(rootPath, pathname === '/' ? '/index.html' : pathname)
    if (!filePath) return send(response, 400, 'bad path')
    fs.stat(filePath, (error, stat) => {
      if (!error && stat.isFile()) return stream(filePath, response)
      if (!path.extname(pathname)) return stream(path.join(rootPath, 'index.html'), response)
      send(response, 404, 'not found')
    })
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function isBlocked(pathname) {
  return pathname.startsWith('/node_modules')
    || pathname.startsWith('/.git')
    || pathname === '/package.json'
    || pathname === '/package-lock.json'
}

function safePath(rootPath, pathname) {
  const filePath = path.normalize(path.join(rootPath, pathname))
  const rootWithSep = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`
  if (filePath !== rootPath && !filePath.startsWith(rootWithSep)) return ''
  return filePath
}

function stream(filePath, response) {
  const type = types[path.extname(filePath)] || 'application/octet-stream'
  response.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
  })
  fs.createReadStream(filePath).pipe(response)
}

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end(body)
}
