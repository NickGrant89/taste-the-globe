import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dbMode, getBackend, sql } from './db.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function dataFile() {
  return process.env.TASTE_JSON_FILE || join(root, 'data', 'store.json')
}

function emptyStore() {
  return { users: [], sessions: [], posts: [], saves: [], ratings: [], threads: [] }
}

function loadJson() {
  try {
    return { ...emptyStore(), ...JSON.parse(readFileSync(dataFile(), 'utf8')) }
  } catch {
    return emptyStore()
  }
}

let jsonState
let writing = Promise.resolve()

function jsonMemory() {
  jsonState ??= loadJson()
  return jsonState
}

function persistJson() {
  const store = jsonMemory()
  writing = writing.then(() => {
    const file = dataFile()
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(store))
    renameSync(tmp, file)
  })
  return writing
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    city: row.city,
    country: row.country,
    bio: row.bio ?? '',
    salt: row.salt,
    passwordHash: row.password_hash ?? row.passwordHash,
    createdAt: row.created_at ?? row.createdAt,
  }
}

function parseJson(value, fallback) {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value
}

async function usingJson() {
  return (await dbMode()) === 'json'
}

export async function findUserByEmail(email) {
  if (await usingJson()) return jsonMemory().users.find((user) => user.email === email) ?? null
  const [row] = await sql('select * from users where email = $1', [email])
  return row ? mapUser(row) : null
}

export async function findUserById(id) {
  if (await usingJson()) return jsonMemory().users.find((user) => user.id === id) ?? null
  const [row] = await sql('select * from users where id = $1', [id])
  return row ? mapUser(row) : null
}

export async function createUser(user) {
  if (await usingJson()) {
    jsonMemory().users.push(user)
    await persistJson()
    return user
  }
  await sql(
    `insert into users (id, email, name, city, country, bio, salt, password_hash, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [user.id, user.email, user.name, user.city, user.country, user.bio, user.salt, user.passwordHash, user.createdAt],
  )
  return user
}

export async function updateUser(user) {
  if (await usingJson()) {
    const found = jsonMemory().users.find((item) => item.id === user.id)
    if (found) Object.assign(found, user)
    await persistJson()
    return
  }
  await sql('update users set name = $1, city = $2, country = $3, bio = $4 where id = $5', [
    user.name,
    user.city,
    user.country,
    user.bio,
    user.id,
  ])
}

export async function findSession(tokenHash, now) {
  if (await usingJson()) {
    return jsonMemory().sessions.find((session) => session.tokenHash === tokenHash && session.expires > now) ?? null
  }
  const [row] = await sql('select token_hash, user_id, expires from sessions where token_hash = $1 and expires > $2', [
    tokenHash,
    now,
  ])
  return row ? { tokenHash: row.token_hash, userId: row.user_id, expires: Number(row.expires) } : null
}

export async function insertSession(session) {
  if (await usingJson()) {
    jsonMemory().sessions.push(session)
    await persistJson()
    return
  }
  await sql('insert into sessions (token_hash, user_id, expires) values ($1, $2, $3)', [
    session.tokenHash,
    session.userId,
    session.expires,
  ])
}

export async function deleteSession(tokenHash) {
  if (await usingJson()) {
    jsonMemory().sessions = jsonMemory().sessions.filter((session) => session.tokenHash !== tokenHash)
    await persistJson()
    return
  }
  await sql('delete from sessions where token_hash = $1', [tokenHash])
}

export async function listPosts() {
  if (await usingJson()) return [...jsonMemory().posts]
  const rows = await sql('select payload from posts order by created_at desc')
  return rows.map((row) => parseJson(row.payload, null)).filter(Boolean)
}

export async function insertPost(entry) {
  if (await usingJson()) {
    jsonMemory().posts.unshift(entry)
    await persistJson()
    return
  }
  await sql('insert into posts (id, author_id, payload, created_at) values ($1, $2, $3::jsonb, $4)', [
    entry.id,
    entry.authorId,
    JSON.stringify(entry),
    Date.now(),
  ])
}

export async function findPost(id) {
  if (await usingJson()) return jsonMemory().posts.find((item) => item.id === id) ?? null
  const [row] = await sql('select payload from posts where id = $1', [id])
  return row ? parseJson(row.payload, null) : null
}

export async function deletePost(id) {
  if (await usingJson()) {
    jsonMemory().posts = jsonMemory().posts.filter((item) => item.id !== id)
    jsonMemory().saves = jsonMemory().saves.filter((item) => item.entryId !== id)
    await persistJson()
    return
  }
  await sql('delete from saves where entry_id = $1', [id])
  await sql('delete from posts where id = $1', [id])
}

export async function addSave(userId, entryId) {
  if (await usingJson()) {
    if (!jsonMemory().saves.some((item) => item.userId === userId && item.entryId === entryId)) {
      jsonMemory().saves.push({ userId, entryId })
      await persistJson()
    }
    return
  }
  await sql(
    'insert into saves (user_id, entry_id) values ($1, $2) on conflict (user_id, entry_id) do nothing',
    [userId, entryId],
  )
}

export async function removeSave(userId, entryId) {
  if (await usingJson()) {
    jsonMemory().saves = jsonMemory().saves.filter((item) => !(item.userId === userId && item.entryId === entryId))
    await persistJson()
    return
  }
  await sql('delete from saves where user_id = $1 and entry_id = $2', [userId, entryId])
}

export async function listSavedIds(userId) {
  if (await usingJson()) return jsonMemory().saves.filter((item) => item.userId === userId).map((item) => item.entryId)
  const rows = await sql('select entry_id from saves where user_id = $1', [userId])
  return rows.map((row) => row.entry_id)
}

export async function upsertRating(userId, entryId, value) {
  if (await usingJson()) {
    const existing = jsonMemory().ratings.find((item) => item.userId === userId && item.entryId === entryId)
    if (existing) existing.value = value
    else jsonMemory().ratings.push({ userId, entryId, value })
    await persistJson()
    return
  }
  await sql(
    `insert into ratings (user_id, entry_id, value) values ($1, $2, $3)
     on conflict (user_id, entry_id) do update set value = excluded.value`,
    [userId, entryId, value],
  )
}

export async function listRatings(userId) {
  const ratings = {}
  if (await usingJson()) {
    for (const rating of jsonMemory().ratings) {
      if (rating.userId === userId) ratings[rating.entryId] = rating.value
    }
    return ratings
  }
  const rows = await sql('select entry_id, value from ratings where user_id = $1', [userId])
  for (const row of rows) ratings[row.entry_id] = Number(row.value)
  return ratings
}

export async function findThread(userId, entryId) {
  if (await usingJson()) return jsonMemory().threads.find((item) => item.userId === userId && item.entryId === entryId) ?? null
  const [row] = await sql('select * from threads where user_id = $1 and entry_id = $2', [userId, entryId])
  return row ? mapThread(row) : null
}

export async function findThreadById(id, userId) {
  if (await usingJson()) return jsonMemory().threads.find((item) => item.id === id && item.userId === userId) ?? null
  const [row] = await sql('select * from threads where id = $1 and user_id = $2', [id, userId])
  return row ? mapThread(row) : null
}

export async function insertThread(thread) {
  if (await usingJson()) {
    jsonMemory().threads.unshift(thread)
    await persistJson()
    return
  }
  await sql('insert into threads (id, user_id, entry_id, with_name, messages) values ($1, $2, $3, $4, $5::jsonb)', [
    thread.id,
    thread.userId,
    thread.entryId,
    thread.withName,
    JSON.stringify(thread.messages),
  ])
}

export async function saveThread(thread) {
  if (await usingJson()) {
    const found = jsonMemory().threads.find((item) => item.id === thread.id)
    if (found) found.messages = thread.messages
    await persistJson()
    return
  }
  await sql('update threads set messages = $1::jsonb where id = $2', [JSON.stringify(thread.messages), thread.id])
}

export async function listThreads(userId) {
  if (await usingJson()) return jsonMemory().threads.filter((thread) => thread.userId === userId)
  const rows = await sql('select * from threads where user_id = $1', [userId])
  return rows.map(mapThread)
}

function mapThread(row) {
  return {
    id: row.id,
    userId: row.user_id ?? row.userId,
    entryId: row.entry_id ?? row.entryId,
    withName: row.with_name ?? row.withName,
    messages: parseJson(row.messages, []),
  }
}

export async function ready() {
  await getBackend()
}

export function jsonFilePresent() {
  return existsSync(dataFile())
}
