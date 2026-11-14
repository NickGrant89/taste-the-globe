import type { Entry, Profile, Thread } from './domain/model.ts'

const KEY = 'taste-the-globe-day1'

export interface Bag {
  v: 1
  profile: Profile
  savedIds: string[]
  ratings: Record<string, number>
  posts: Entry[]
  threads: Thread[]
}

export const initialBag: Bag = {
  v: 1,
  profile: {
    name: 'You',
    city: 'London',
    country: 'United Kingdom',
    bio: '',
  },
  savedIds: [],
  ratings: {},
  posts: [],
  threads: [
    {
      id: 'thread-lasagna-milan',
      entryId: 'lasagna-milan',
      withName: 'Rosa Bianchi',
      messages: [
        {
          id: 'seed-rosa',
          from: 'them',
          text: 'The ragù wants a full afternoon. If you are cooking it in Milan, let the crust go almost dark at the edge.',
          at: 'Earlier',
        },
      ],
    },
    {
      id: 'thread-hackney-plot',
      entryId: 'hackney-plot',
      withName: 'Ellen Ward',
      messages: [
        {
          id: 'seed-ellen',
          from: 'them',
          text: 'The tomatoes are coming on. If you are nearby this Saturday, there will be more than we can eat. Message before you walk over.',
          at: 'Earlier',
        },
      ],
    },
  ],
}

function isBag(value: unknown): value is Bag {
  if (!value || typeof value !== 'object') return false
  const bag = value as Partial<Bag>
  return bag.v === 1 && !!bag.profile && Array.isArray(bag.savedIds) && Array.isArray(bag.posts)
}

export function loadBag(): Bag {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initialBag
    const parsed: unknown = JSON.parse(raw)
    if (!isBag(parsed)) return initialBag
    return {
      ...initialBag,
      ...parsed,
      ratings: parsed.ratings ?? {},
      threads: Array.isArray(parsed.threads) ? parsed.threads : initialBag.threads,
    }
  } catch {
    return initialBag
  }
}

export function saveBag(bag: Bag): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(bag))
  } catch {
    /* private mode and full disks should not break the atlas */
  }
}
