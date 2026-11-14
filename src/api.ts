import type { Entry, Profile, Thread } from './domain/model.ts'

const TOKEN_KEY = 'taste-the-globe-token'

export interface Account {
  id: string
  email: string
  name: string
  city: string
  country: string
  bio: string
}

export interface SessionPayload {
  user: Account | null
  posts: Entry[]
  savedIds: string[]
  ratings: Record<string, number>
  threads: Thread[]
}

export interface AuthPayload extends SessionPayload {
  token: string
}

export function accountProfile(account: Account): Profile {
  return {
    name: account.name,
    city: account.city,
    country: account.country,
    bio: account.bio,
  }
}

export function authToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function storeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode still lets someone look at the atlas */
  }
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('content-type', 'application/json')
  const token = authToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  const response = await fetch(path, { ...init, headers })
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new ApiError(response.status, data.error || 'The atlas could not do that.')
  return data as T
}
