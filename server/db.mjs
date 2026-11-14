import { mkdirSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** @typedef {'postgres' | 'pglite' | 'json'} DbKind */

/** @type {Promise<{ kind: DbKind, query?: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]> }> | undefined} */
let backend

export async function getBackend() {
  backend ??= initBackend().catch((error) => {
    backend = undefined
    throw error
  })
  return backend
}

export async function dbMode() {
  return (await getBackend()).kind
}

export async function sql(text, params = []) {
  const current = await getBackend()
  if (!current.query) throw new Error('JSON store has no SQL backend')
  return current.query(text, params)
}

async function initBackend() {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? ''
  const forceJson = process.env.TASTE_FORCE_JSON === '1'
  const pgliteDir = process.env.TASTE_PGLITE_DIR || join(root, '.pglite')
  if (forceJson) return { kind: 'json' }
  if (databaseUrl) {
    const pg = await import('pg')
    const Pool = pg.default?.Pool ?? pg.Pool
    const pool = new Pool({ connectionString: databaseUrl, max: 5 })
    await applyMigrations(async (sqlText) => {
      await pool.query(sqlText)
    })
    return {
      kind: 'postgres',
      query: async (text, params = []) => (await pool.query(text, params)).rows,
    }
  }
  try {
    const { PGlite } = await import('@electric-sql/pglite')
    mkdirSync(pgliteDir, { recursive: true })
    const db = new PGlite(pgliteDir)
    await applyMigrations(async (sqlText) => {
      await db.exec(sqlText)
    })
    return {
      kind: 'pglite',
      query: async (text, params = []) => (await db.query(text, params)).rows,
    }
  } catch (error) {
    console.error('PGlite unavailable, using the JSON file store.', error instanceof Error ? error.message : error)
    return { kind: 'json' }
  }
}

export async function applyMigrations(exec) {
  const dir = join(root, 'migrations')
  const files = (await readdir(dir).catch(() => [])).filter((name) => name.endsWith('.sql')).sort()
  for (const file of files) {
    await exec(await readFile(join(dir, file), 'utf8'))
  }
}
