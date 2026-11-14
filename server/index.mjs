import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dataFile = join(root, 'data', 'store.json')
const distDir = join(root, 'dist')
const serveStatic = process.env.SERVE_STATIC === '1'
const port = Number(process.env.PORT || (serveStatic ? 4180 : 8787))

const AID_CAUTION =
  'Sample pin for this Day 1 build. It is not a live food-bank or surplus listing. Do not travel here expecting food.'
const MARKET_CAUTION =
  'No payment and no delivery on this pin. Collect from the place and time shown. Any price is a sample figure, not a checkout.'
const sections = new Set(['recipes', 'allotments', 'free-food', 'reviews', 'marketplace'])
const photoHints = [
  ['lasagna', '/photos/lasagna.jpg'],
  ['tonkotsu', '/photos/ramen.jpg'],
  ['ramen', '/photos/ramen.jpg'],
  ['mole', '/photos/mole.jpg'],
  ['jollof', '/photos/jollof.jpg'],
  ['tagine', '/photos/tagine.jpg'],
  ['pho', '/photos/pho.jpg'],
  ['kimchi', '/photos/jjigae.jpg'],
  ['jjigae', '/photos/jjigae.jpg'],
  ['pizza', '/photos/pizza.jpg'],
  ['taco', '/photos/tacos.jpg'],
  ['prawn', '/photos/prawns.jpg'],
  ['cardamom', '/photos/bun.jpg'],
  ['bun', '/photos/bun.jpg'],
  ['omelette', '/photos/omelette.jpg'],
  ['egg', '/photos/omelette.jpg'],
  ['lamb', '/photos/lamb.jpg'],
  ['honey', '/photos/honey.jpg'],
  ['oil', '/photos/oil.jpg'],
  ['chili', '/photos/chili.jpg'],
  ['plantain', '/photos/plantain.jpg'],
  ['citrus', '/photos/citrus.jpg'],
  ['tomato', '/photos/allotment.jpg'],
]

function photoFor(section, title, tags) {
  const hay = `${title} ${tags.join(' ')}`.toLowerCase()
  for (const [needle, src] of photoHints) {
    if (hay.includes(needle)) return src
  }
  if (section === 'allotments') return '/photos/allotment.jpg'
  if (section === 'free-food') return '/photos/greens.jpg'
  return undefined
}

function emptyStore() {
  return { users: [], sessions: [], posts: [], saves: [], ratings: [], threads: [] }
}

function load() {
  try {
    return { ...emptyStore(), ...JSON.parse(readFileSync(dataFile, 'utf8')) }
  } catch {
    return emptyStore()
  }
}

const store = load()
let writing = Promise.resolve()

function persist() {
  writing = writing.then(() => {
    mkdirSync(join(root, 'data'), { recursive: true })
    const tmp = `${dataFile}.tmp`
    writeFileSync(tmp, JSON.stringify(store))
    renameSync(tmp, dataFile)
  })
  return writing
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    city: user.city,
    country: user.country,
    bio: user.bio,
  }
}

function userFrom(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const hash = hashToken(token)
  const now = Date.now()
  const session = store.sessions.find((item) => item.tokenHash === hash && item.expires > now)
  if (!session) return null
  return store.users.find((user) => user.id === session.userId) ?? null
}

function bootstrap(user) {
  if (!user) return { user: null, posts: store.posts, savedIds: [], ratings: {}, threads: [] }
  const ratings = {}
  for (const rating of store.ratings) {
    if (rating.userId === user.id) ratings[rating.entryId] = rating.value
  }
  return {
    user: publicUser(user),
    posts: store.posts,
    savedIds: store.saves.filter((save) => save.userId === user.id).map((save) => save.entryId),
    ratings,
    threads: store.threads.filter((thread) => thread.userId === user.id),
  }
}

function issue(user) {
  const token = randomBytes(32).toString('hex')
  store.sessions.push({
    tokenHash: hashToken(token),
    userId: user.id,
    expires: Date.now() + 1000 * 60 * 60 * 24 * 30,
  })
  return token
}

function seedThreads(userId) {
  return [
    {
      id: `thread-lasagna-milan-${userId}`,
      userId,
      entryId: 'lasagna-milan',
      withName: 'Rosa Bianchi',
      messages: [
        {
          id: `seed-rosa-${userId}`,
          from: 'them',
          text: 'The ragù wants a full afternoon. If you are cooking it in Milan, let the crust go almost dark at the edge.',
          at: 'Earlier',
        },
      ],
    },
    {
      id: `thread-hackney-plot-${userId}`,
      userId,
      entryId: 'hackney-plot',
      withName: 'Ellen Ward',
      messages: [
        {
          id: `seed-ellen-${userId}`,
          from: 'them',
          text: 'The tomatoes are coming on. If you are nearby this Saturday, there will be more than we can eat. Message before you walk over.',
          at: 'Earlier',
        },
      ],
    },
  ]
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 80_000) {
        reject(new Error('too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('bad json'))
      }
    })
    req.on('error', reject)
  })
}

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function clean(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120
}

const hits = new Map()
function limited(key, max, windowMs) {
  const now = Date.now()
  const list = (hits.get(key) || []).filter((time) => now - time < windowMs)
  if (list.length >= max) return true
  list.push(now)
  hits.set(key, list)
  return false
}

async function handleApi(req, res, url) {
  const user = userFrom(req)
  const ip = req.socket.remoteAddress || 'local'

  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true })
  if (req.method === 'GET' && url.pathname === '/api/bootstrap') return send(res, 200, bootstrap(user))

  if (req.method === 'POST' && url.pathname === '/api/signup') {
    if (limited(`signup:${ip}`, 8, 60 * 60 * 1000)) {
      return send(res, 429, { error: 'Too many new accounts from here. Try again later.' })
    }
    let body
    try {
      body = await readBody(req)
    } catch {
      return send(res, 400, { error: 'Could not read that.' })
    }
    const email = clean(body.email, 120).toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''
    const name = clean(body.name, 40)
    const city = clean(body.city, 60) || 'London'
    const country = clean(body.country, 60) || 'United Kingdom'
    if (!validEmail(email)) return send(res, 400, { error: 'Use an email address.' })
    if (password.length < 8 || password.length > 200) {
      return send(res, 400, { error: 'Password needs at least 8 characters.' })
    }
    if (name.length < 2) return send(res, 400, { error: 'Add the name people should see on your pins.' })
    if (store.users.some((item) => item.email === email)) {
      return send(res, 409, { error: 'That email already has an account. Sign in instead.' })
    }
    const salt = randomBytes(16).toString('hex')
    const created = {
      id: randomBytes(12).toString('hex'),
      email,
      name,
      city,
      country,
      bio: '',
      salt,
      passwordHash: scryptSync(password, salt, 32).toString('hex'),
      createdAt: new Date().toISOString(),
    }
    store.users.push(created)
    store.threads.push(...seedThreads(created.id))
    const token = issue(created)
    await persist()
    return send(res, 201, { token, ...bootstrap(created) })
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (limited(`login:${ip}`, 20, 15 * 60 * 1000)) {
      return send(res, 429, { error: 'Too many sign-in attempts. Wait a little.' })
    }
    let body
    try {
      body = await readBody(req)
    } catch {
      return send(res, 400, { error: 'Could not read that.' })
    }
    const email = clean(body.email, 120).toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''
    const found = store.users.find((item) => item.email === email)
    const dummy = scryptSync(password, 'taste-the-globe-demo', 32)
    const attempt = found ? scryptSync(password, found.salt, 32) : dummy
    const actual = found ? Buffer.from(found.passwordHash, 'hex') : dummy
    const matches = actual.length === attempt.length && timingSafeEqual(actual, attempt)
    if (!found || !matches) return send(res, 401, { error: 'Email or password does not match.' })
    const token = issue(found)
    await persist()
    return send(res, 200, { token, ...bootstrap(found) })
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (token) {
      const hash = hashToken(token)
      store.sessions = store.sessions.filter((session) => session.tokenHash !== hash)
      await persist()
    }
    return send(res, 200, { ok: true })
  }

  if (req.method === 'PATCH' && url.pathname === '/api/me') {
    if (!user) return send(res, 401, { error: 'Sign in first.' })
    let body
    try {
      body = await readBody(req)
    } catch {
      return send(res, 400, { error: 'Could not read that.' })
    }
    const name = clean(body.name, 40)
    const city = clean(body.city, 60)
    const country = clean(body.country, 60)
    if (name.length >= 2) user.name = name
    if (city) user.city = city
    if (country) user.country = country
    user.bio = clean(body.bio, 280)
    await persist()
    return send(res, 200, { user: publicUser(user) })
  }

  if (req.method === 'POST' && url.pathname === '/api/posts') {
    if (!user) return send(res, 401, { error: 'Sign in to pin food other people can see.' })
    if (limited(`post:${user.id}`, 30, 60 * 60 * 1000)) {
      return send(res, 429, { error: 'That is a lot of pins in one hour.' })
    }
    let body
    try {
      body = await readBody(req)
    } catch {
      return send(res, 400, { error: 'Could not read that.' })
    }
    const section = body.section
    const title = clean(body.title, 80)
    const summary = clean(body.summary, 400)
    const city = clean(body.city, 60)
    const country = clean(body.country, 60)
    const lat = Number(body.lat)
    const lng = Number(body.lng)
    if (!sections.has(section)) return send(res, 400, { error: 'Choose a section.' })
    if (title.length < 3 || summary.length < 12) {
      return send(res, 400, { error: 'Add a title and at least a sentence about the food.' })
    }
    if (!city || !country || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return send(res, 400, { error: 'Choose a city on the list.' })
    }
    const tags = Array.isArray(body.tags)
      ? body.tags.map((tag) => clean(String(tag), 24)).filter(Boolean).slice(0, 8)
      : []
    let pickup
    if (section === 'marketplace') {
      const place = clean(body.pickup?.place, 120)
      const windowText = clean(body.pickup?.window, 120)
      if (place.length < 3 || windowText.length < 3) {
        return send(res, 400, { error: 'A market pin needs a pickup place and a time.' })
      }
      pickup = { place, window: windowText, note: 'Message them before you go. There is no checkout.' }
    }
    const entry = {
      id: `member-${randomBytes(8).toString('hex')}`,
      section,
      title,
      city,
      country,
      lat,
      lng,
      summary,
      story:
        section === 'marketplace'
          ? `${user.name} is offering this from ${city}. Collect it from the place and time on the pin. Nothing is paid through Taste the Globe.`
          : `${user.name} shared this from ${city}. The pin is on the shared atlas, tied to that place.`,
      tags,
      author: user.name,
      authorPlace: `${city}, ${country}`,
      authorId: user.id,
      facts:
        section === 'marketplace'
          ? [
              { label: 'Collect', value: pickup.place },
              { label: 'When', value: pickup.window },
              { label: 'Pay', value: 'Not on this pin' },
            ]
          : [{ label: 'Shared', value: 'On the atlas' }],
      pickup,
      origin: 'member',
      photo: photoFor(section, title, tags),
      caution: section === 'free-food' ? AID_CAUTION : section === 'marketplace' ? MARKET_CAUTION : undefined,
    }
    store.posts.unshift(entry)
    await persist()
    return send(res, 201, { entry })
  }

  const postId = url.pathname.match(/^\/api\/posts\/([a-zA-Z0-9-]+)$/)
  if (postId && req.method === 'DELETE') {
    if (!user) return send(res, 401, { error: 'Sign in first.' })
    const post = store.posts.find((item) => item.id === postId[1])
    if (!post || post.authorId !== user.id) return send(res, 404, { error: 'That pin is not yours.' })
    store.posts = store.posts.filter((item) => item.id !== post.id)
    store.saves = store.saves.filter((item) => item.entryId !== post.id)
    await persist()
    return send(res, 200, { ok: true })
  }

  if (req.method === 'POST' && url.pathname === '/api/saves') {
    if (!user) return send(res, 401, { error: 'Sign in to keep a pin.' })
    let body
    try {
      body = await readBody(req)
    } catch {
      return send(res, 400, { error: 'Could not read that.' })
    }
    const entryId = clean(body.entryId, 80)
    if (!entryId) return send(res, 400, { error: 'Missing pin.' })
    if (!store.saves.some((item) => item.userId === user.id && item.entryId === entryId)) {
      store.saves.push({ userId: user.id, entryId })
      await persist()
    }
    return send(res, 200, { ok: true })
  }

  const saveId = url.pathname.match(/^\/api\/saves\/([^/]+)$/)
  if (saveId && req.method === 'DELETE') {
    if (!user) return send(res, 401, { error: 'Sign in first.' })
    const entryId = decodeURIComponent(saveId[1])
    store.saves = store.saves.filter((item) => !(item.userId === user.id && item.entryId === entryId))
    await persist()
    return send(res, 200, { ok: true })
  }

  if (req.method === 'PUT' && url.pathname === '/api/ratings') {
    if (!user) return send(res, 401, { error: 'Sign in to rate a pin.' })
    let body
    try {
      body = await readBody(req)
    } catch {
      return send(res, 400, { error: 'Could not read that.' })
    }
    const entryId = clean(body.entryId, 80)
    const value = Number(body.value)
    if (!entryId || ![1, 2, 3, 4, 5].includes(value)) return send(res, 400, { error: 'Choose 1 to 5 stars.' })
    const existing = store.ratings.find((item) => item.userId === user.id && item.entryId === entryId)
    if (existing) existing.value = value
    else store.ratings.push({ userId: user.id, entryId, value })
    await persist()
    return send(res, 200, { ok: true })
  }

  if (req.method === 'POST' && url.pathname === '/api/messages') {
    if (!user) return send(res, 401, { error: 'Sign in to message someone.' })
    let body
    try {
      body = await readBody(req)
    } catch {
      return send(res, 400, { error: 'Could not read that.' })
    }
    const entryId = clean(body.entryId, 80)
    const text = clean(body.text, 600)
    const withName = clean(body.withName, 60) || 'Them'
    if (!entryId || !text) return send(res, 400, { error: 'Write a note first.' })
    let thread = store.threads.find((item) => item.userId === user.id && item.entryId === entryId)
    const mail = { id: randomBytes(8).toString('hex'), from: 'you', text, at: 'Just now' }
    if (!thread) {
      thread = {
        id: `thread-${entryId}-${user.id}`,
        userId: user.id,
        entryId,
        withName,
        messages: [mail],
      }
      store.threads.unshift(thread)
    } else {
      thread.messages.push(mail)
    }
    await persist()
    return send(res, 201, { thread })
  }

  const reply = url.pathname.match(/^\/api\/threads\/([^/]+)\/messages$/)
  if (reply && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'Sign in first.' })
    let body
    try {
      body = await readBody(req)
    } catch {
      return send(res, 400, { error: 'Could not read that.' })
    }
    const text = clean(body.text, 600)
    const thread = store.threads.find((item) => item.id === decodeURIComponent(reply[1]) && item.userId === user.id)
    if (!thread || !text) return send(res, 404, { error: 'That conversation is not on your account.' })
    thread.messages.push({ id: randomBytes(8).toString('hex'), from: 'you', text, at: 'Just now' })
    await persist()
    return send(res, 201, { thread })
  }

  return send(res, 404, { error: 'Not found.' })
}

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

createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((error) => {
      console.error(error)
      if (!res.headersSent) send(res, 500, { error: 'Something went wrong.' })
    })
    return
  }
  if (!serveStatic) {
    send(res, 404, { error: 'API only' })
    return
  }
  const requested = normalize(decodeURIComponent(url.pathname))
  const relative = requested === '/' ? '/index.html' : requested
  if (relative.includes('..')) {
    send(res, 400, { error: 'Bad path' })
    return
  }
  if (serveFile(res, join(distDir, relative))) return
  if (serveFile(res, join(distDir, 'index.html'))) return
  send(res, 404, { error: 'Not found' })
}).listen(port, '127.0.0.1', () => {
  console.log(`Taste the Globe listening on http://127.0.0.1:${port}`)
})
