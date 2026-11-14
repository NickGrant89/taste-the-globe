import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleRequest } from './handlers.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const distDir = join(root, 'dist')
const serveStatic = process.env.SERVE_STATIC === '1'
const port = Number(process.env.PORT || (serveStatic ? 4180 : 8787))

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function serveFile(res, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false
  res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream' })
  createReadStream(filePath).pipe(res)
  return true
}

async function toWebRequest(req) {
  const host = req.headers.host || '127.0.0.1'
  const url = `http://${host}${req.url || '/'}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
  }
  const method = req.method || 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  if (!hasBody) return new Request(url, { method, headers })
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 80_000) {
      req.destroy()
      throw new Error('too large')
    }
    chunks.push(chunk)
  }
  return new Request(url, { method, headers, body: Buffer.concat(chunks) })
}

async function writeWebResponse(res, response) {
  const headers = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  res.writeHead(response.status, headers)
  res.end(Buffer.from(await response.arrayBuffer()))
}

createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  if (url.pathname.startsWith('/api/')) {
    toWebRequest(req)
      .then((request) => handleRequest(request))
      .then((response) => writeWebResponse(res, response))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : error)
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'Something went wrong.' }))
        }
      })
    return
  }
  if (!serveStatic) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'API only' }))
    return
  }
  const requested = normalize(decodeURIComponent(url.pathname))
  const relative = requested === '/' ? '/index.html' : requested
  if (relative.includes('..')) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Bad path' }))
    return
  }
  if (serveFile(res, join(distDir, relative))) return
  if (serveFile(res, join(distDir, 'index.html'))) return
  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: 'Not found' }))
}).listen(port, '127.0.0.1', () => {
  console.log(`Taste the Globe listening on http://127.0.0.1:${port}`)
})
