import type { Entry, SectionId } from './model.ts'

export function entryText(entry: Entry): string {
  const facts = entry.facts.map((fact) => `${fact.label} ${fact.value}`).join(' ')
  const lines = entry.lines?.items.join(' ') ?? ''
  return [
    entry.title,
    entry.city,
    entry.country,
    entry.summary,
    entry.story,
    entry.author,
    entry.authorPlace,
    entry.tags.join(' '),
    entry.pickup?.place ?? '',
    entry.pickup?.window ?? '',
    facts,
    lines,
  ]
    .join(' ')
    .toLowerCase()
}

export function visibleEntries(
  entries: Entry[],
  section: SectionId | 'all',
  query: string,
): Entry[] {
  const needle = query.trim().toLowerCase()
  return entries.filter((entry) => {
    if (section !== 'all' && entry.section !== section) return false
    if (!needle) return true
    return entryText(entry).includes(needle)
  })
}

export function relatedEntries(entries: Entry[], entry: Entry): Entry[] {
  if (!entry.family) return []
  return entries.filter((other) => other.family === entry.family && other.id !== entry.id)
}

export function nudgePin(lat: number, lng: number, salt: number): { lat: number; lng: number } {
  const angle = salt * 2.4
  return {
    lat: lat + Math.sin(angle) * 0.08,
    lng: lng + Math.cos(angle) * 0.08,
  }
}
