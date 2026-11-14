import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { dbMode } from './db.mjs'
import {
  addSave,
  createUser,
  deletePost,
  deleteSession,
  findPost,
  findSession,
  findThread,
  findThreadById,
  findUserByEmail,
  findUserById,
  insertPost,
  insertSession,
  insertThread,
  listPosts,
  listRatings,
  listSavedIds,
  listThreads,
  ready,
  removeSave,
  saveThread,
  updateUser,
  upsertRating,
} from './store.mjs'

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

const hits = new Map()

function photoFor(section, title, tags) {
  const hay = `${title} ${tags.join(' ')}`.toLowerCase()
  for (const [needle, src] of photoHints) {
    if (hay.includes(needle)) return src
  }
  if (section === 'allotments') return '/photos/allotment.jpg'
  if (section === 'free-food') return '/photos/greens.jpg'
  return undefined
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function clean(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120
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

function clientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'local'
}

function limited(key, max, windowMs) {
  const now = Date.now()
  const list = (hits.get(key) || []).filter((time) => now - time < windowMs)
  if (list.length >= max) return true
  list.push(now)
  hits.set(key, list)
  return false
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

async function userFrom(request) {
  const token = bearerToken(request)
  if (!token) return null
  const session = await findSession(hashToken(token), Date.now())
  if (!session) return null
  return findUserById(session.userId)
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

async function bootstrap(user) {
  const posts = await listPosts()
  if (!user) return { user: null, posts, savedIds: [], ratings: {}, threads: [] }
  return {
    user: publicUser(user),
    posts,
    savedIds: await listSavedIds(user.id),
    ratings: await listRatings(user.id),
    threads: await listThreads(user.id),
  }
}

async function issue(user) {
  const token = randomBytes(32).toString('hex')
  await insertSession({
    tokenHash: hashToken(token),
    userId: user.id,
    expires: Date.now() + 1000 * 60 * 60 * 24 * 30,
  })
  return token
}

async function readJson(request) {
  const text = await request.text()
  if (text.length > 80_000) throw new Error('too large')
  if (!text) return {}
  return JSON.parse(text)
}

function publicThread(thread) {
  return {
    id: thread.id,
    entryId: thread.entryId,
    withName: thread.withName,
    messages: thread.messages,
  }
}

export async function handleHealth() {
  await ready()
  return json({ ok: true, db: await dbMode() })
}

export async function handleBootstrap(request) {
  await ready()
  const user = await userFrom(request)
  return json(await bootstrap(user))
}

export async function handleSignup(request) {
  await ready()
  const ip = clientKey(request)
  if (limited(`signup:${ip}`, 8, 60 * 60 * 1000)) {
    return json({ error: 'Too many new accounts from here. Try again later.' }, 429)
  }
  let body
  try {
    body = await readJson(request)
  } catch {
    return json({ error: 'Could not read that.' }, 400)
  }
  const email = clean(body.email, 120).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const name = clean(body.name, 40)
  const city = clean(body.city, 60) || 'London'
  const country = clean(body.country, 60) || 'United Kingdom'
  if (!validEmail(email)) return json({ error: 'Use an email address.' }, 400)
  if (password.length < 8 || password.length > 200) {
    return json({ error: 'Password needs at least 8 characters.' }, 400)
  }
  if (name.length < 2) return json({ error: 'Add the name people should see on your pins.' }, 400)
  if (await findUserByEmail(email)) {
    return json({ error: 'That email already has an account. Sign in instead.' }, 409)
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
  await createUser(created)
  for (const thread of seedThreads(created.id)) await insertThread(thread)
  const token = await issue(created)
  return json({ token, ...(await bootstrap(created)) }, 201)
}

export async function handleLogin(request) {
  await ready()
  const ip = clientKey(request)
  if (limited(`login:${ip}`, 20, 15 * 60 * 1000)) {
    return json({ error: 'Too many sign-in attempts. Wait a little.' }, 429)
  }
  let body
  try {
    body = await readJson(request)
  } catch {
    return json({ error: 'Could not read that.' }, 400)
  }
  const email = clean(body.email, 120).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const found = await findUserByEmail(email)
  const dummy = scryptSync(password, 'taste-the-globe-demo', 32)
  const attempt = found ? scryptSync(password, found.salt, 32) : dummy
  const actual = found ? Buffer.from(found.passwordHash, 'hex') : dummy
  const matches = actual.length === attempt.length && timingSafeEqual(actual, attempt)
  if (!found || !matches) return json({ error: 'Email or password does not match.' }, 401)
  const token = await issue(found)
  return json({ token, ...(await bootstrap(found)) })
}

export async function handleLogout(request) {
  await ready()
  const token = bearerToken(request)
  if (token) await deleteSession(hashToken(token))
  return json({ ok: true })
}

export async function handleMe(request) {
  await ready()
  const user = await userFrom(request)
  if (!user) return json({ error: 'Sign in first.' }, 401)
  let body
  try {
    body = await readJson(request)
  } catch {
    return json({ error: 'Could not read that.' }, 400)
  }
  const name = clean(body.name, 40)
  const city = clean(body.city, 60)
  const country = clean(body.country, 60)
  if (name.length >= 2) user.name = name
  if (city) user.city = city
  if (country) user.country = country
  user.bio = clean(body.bio, 280)
  await updateUser(user)
  return json({ user: publicUser(user) })
}

export async function handleCreatePost(request) {
  await ready()
  const user = await userFrom(request)
  if (!user) return json({ error: 'Sign in to pin food other people can see.' }, 401)
  if (limited(`post:${user.id}`, 30, 60 * 60 * 1000)) {
    return json({ error: 'That is a lot of pins in one hour.' }, 429)
  }
  let body
  try {
    body = await readJson(request)
  } catch {
    return json({ error: 'Could not read that.' }, 400)
  }
  const section = body.section
  const title = clean(body.title, 80)
  const summary = clean(body.summary, 400)
  const city = clean(body.city, 60)
  const country = clean(body.country, 60)
  const lat = Number(body.lat)
  const lng = Number(body.lng)
  if (!sections.has(section)) return json({ error: 'Choose a section.' }, 400)
  if (title.length < 3 || summary.length < 12) {
    return json({ error: 'Add a title and at least a sentence about the food.' }, 400)
  }
  if (!city || !country || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: 'Choose a city on the list.' }, 400)
  }
  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag) => clean(String(tag), 24)).filter(Boolean).slice(0, 8)
    : []
  let pickup
  if (section === 'marketplace') {
    const place = clean(body.pickup?.place, 120)
    const windowText = clean(body.pickup?.window, 120)
    if (place.length < 3 || windowText.length < 3) {
      return json({ error: 'A market pin needs a pickup place and a time.' }, 400)
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
  await insertPost(entry)
  return json({ entry }, 201)
}

export async function handleDeletePost(request) {
  await ready()
  const user = await userFrom(request)
  if (!user) return json({ error: 'Sign in first.' }, 401)
  const id = decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '')
  const post = await findPost(id)
  if (!post || post.authorId !== user.id) return json({ error: 'That pin is not yours.' }, 404)
  await deletePost(post.id)
  return json({ ok: true })
}

export async function handleCreateSave(request) {
  await ready()
  const user = await userFrom(request)
  if (!user) return json({ error: 'Sign in to keep a pin.' }, 401)
  let body
  try {
    body = await readJson(request)
  } catch {
    return json({ error: 'Could not read that.' }, 400)
  }
  const entryId = clean(body.entryId, 80)
  if (!entryId) return json({ error: 'Missing pin.' }, 400)
  await addSave(user.id, entryId)
  return json({ ok: true })
}

export async function handleDeleteSave(request) {
  await ready()
  const user = await userFrom(request)
  if (!user) return json({ error: 'Sign in first.' }, 401)
  const entryId = decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '')
  await removeSave(user.id, entryId)
  return json({ ok: true })
}

export async function handleRating(request) {
  await ready()
  const user = await userFrom(request)
  if (!user) return json({ error: 'Sign in to rate a pin.' }, 401)
  let body
  try {
    body = await readJson(request)
  } catch {
    return json({ error: 'Could not read that.' }, 400)
  }
  const entryId = clean(body.entryId, 80)
  const value = Number(body.value)
  if (!entryId || ![1, 2, 3, 4, 5].includes(value)) return json({ error: 'Choose 1 to 5 stars.' }, 400)
  await upsertRating(user.id, entryId, value)
  return json({ ok: true })
}

export async function handleMessage(request) {
  await ready()
  const user = await userFrom(request)
  if (!user) return json({ error: 'Sign in to message someone.' }, 401)
  let body
  try {
    body = await readJson(request)
  } catch {
    return json({ error: 'Could not read that.' }, 400)
  }
  const entryId = clean(body.entryId, 80)
  const text = clean(body.text, 600)
  const withName = clean(body.withName, 60) || 'Them'
  if (!entryId || !text) return json({ error: 'Write a note first.' }, 400)
  let thread = await findThread(user.id, entryId)
  const mail = { id: randomBytes(8).toString('hex'), from: 'you', text, at: 'Just now' }
  if (!thread) {
    thread = {
      id: `thread-${entryId}-${user.id}`,
      userId: user.id,
      entryId,
      withName,
      messages: [mail],
    }
    await insertThread(thread)
  } else {
    thread.messages.push(mail)
    await saveThread(thread)
  }
  return json({ thread: publicThread(thread) }, 201)
}

export async function handleThreadReply(request) {
  await ready()
  const user = await userFrom(request)
  if (!user) return json({ error: 'Sign in first.' }, 401)
  let body
  try {
    body = await readJson(request)
  } catch {
    return json({ error: 'Could not read that.' }, 400)
  }
  const parts = new URL(request.url).pathname.split('/').filter(Boolean)
  const threadId = decodeURIComponent(parts[2] || '')
  const text = clean(body.text, 600)
  const thread = await findThreadById(threadId, user.id)
  if (!thread || !text) return json({ error: 'That conversation is not on your account.' }, 404)
  thread.messages.push({ id: randomBytes(8).toString('hex'), from: 'you', text, at: 'Just now' })
  await saveThread(thread)
  return json({ thread: publicThread(thread) }, 201)
}

export async function handleRequest(request) {
  const url = new URL(request.url)
  const { method, pathname } = { method: request.method, pathname: url.pathname }
  try {
    if (method === 'GET' && pathname === '/api/health') return handleHealth()
    if (method === 'GET' && pathname === '/api/bootstrap') return handleBootstrap(request)
    if (method === 'POST' && pathname === '/api/signup') return handleSignup(request)
    if (method === 'POST' && pathname === '/api/login') return handleLogin(request)
    if (method === 'POST' && pathname === '/api/logout') return handleLogout(request)
    if (method === 'PATCH' && pathname === '/api/me') return handleMe(request)
    if (method === 'POST' && pathname === '/api/posts') return handleCreatePost(request)
    if (method === 'DELETE' && /^\/api\/posts\/[^/]+$/.test(pathname)) return handleDeletePost(request)
    if (method === 'POST' && pathname === '/api/saves') return handleCreateSave(request)
    if (method === 'DELETE' && /^\/api\/saves\/[^/]+$/.test(pathname)) return handleDeleteSave(request)
    if (method === 'PUT' && pathname === '/api/ratings') return handleRating(request)
    if (method === 'POST' && pathname === '/api/messages') return handleMessage(request)
    if (method === 'POST' && /^\/api\/threads\/[^/]+\/messages$/.test(pathname)) return handleThreadReply(request)
    return json({ error: 'Not found.' }, 404)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return json({ error: 'Something went wrong.' }, 500)
  }
}
