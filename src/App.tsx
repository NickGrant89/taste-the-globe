import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { accountProfile, api, ApiError, authToken, storeToken, type Account, type AuthPayload, type SessionPayload } from './api.ts'
import { catalog } from './domain/catalog.ts'
import { visibleEntries } from './domain/query.ts'
import type { Entry, PostDraft, Profile, SectionId, Thread } from './domain/model.ts'
import { initialBag, loadBag, saveBag, type Bag } from './persist.ts'
import {
  AtlasList,
  AuthDialog,
  BottomNav,
  ComposeDialog,
  DetailSheet,
  InboxPanel,
  ProfilePanel,
  StageChrome,
  TopBar,
} from './ui.tsx'

const GlobeScene = lazy(() => import('./globe/GlobeScene.tsx'))

type Screen = 'explore' | 'inbox' | 'profile'

interface FailProps {
  children: ReactNode
  onFail: () => void
}

interface FailState {
  failed: boolean
}

class GlobeBoundary extends Component<FailProps, FailState> {
  state: FailState = { failed: false }

  static getDerivedStateFromError(): FailState {
    return { failed: true }
  }

  componentDidCatch(): void {
    this.props.onFail()
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'The atlas could not do that.'
}

export default function App() {
  const [bag, setBag] = useState<Bag>(() => loadBag())
  const [account, setAccount] = useState<Account | null>(null)
  const [sharedPosts, setSharedPosts] = useState<Entry[]>([])
  const [live, setLive] = useState(false)
  const [screen, setScreen] = useState<Screen>('explore')
  const [mode, setMode] = useState<'globe' | 'list'>('globe')
  const [section, setSection] = useState<SectionId | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [compose, setCompose] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [shareAfterAuth, setShareAfterAuth] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [globeBroken, setGlobeBroken] = useState(false)
  const [globeAttempt, setGlobeAttempt] = useState(0)
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => {
    saveBag(bag)
  }, [bag])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (compose) setCompose(false)
      else if (authOpen) setAuthOpen(false)
      else if (selectedId) setSelectedId(null)
      else if (query) setQuery('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [authOpen, compose, query, selectedId])

  function adopt(data: SessionPayload) {
    setLive(true)
    setSharedPosts(data.posts)
    setAccount(data.user)
    if (!data.user) return
    setBag((current) => ({
      ...current,
      profile: accountProfile(data.user as Account),
      savedIds: data.savedIds,
      ratings: data.ratings,
      threads: data.threads,
      posts: [],
    }))
  }

  useEffect(() => {
    let cancel = false
    api<SessionPayload>('/api/bootstrap')
      .then((data) => {
        if (!cancel) adopt(data)
      })
      .catch(() => {
        if (!cancel) setLive(false)
      })
    return () => {
      cancel = true
    }
  }, [])

  async function carryLocalOntoAccount() {
    const local = loadBag()
    for (const post of local.posts) {
      try {
        await api('/api/posts', {
          method: 'POST',
          body: JSON.stringify({
            section: post.section,
            title: post.title,
            city: post.city,
            country: post.country,
            lat: post.lat,
            lng: post.lng,
            summary: post.summary,
            tags: post.tags,
            pickup: post.pickup ? { place: post.pickup.place, window: post.pickup.window } : undefined,
          }),
        })
      } catch {
        /* a pin that fails to move stays off the shared atlas */
      }
    }
    for (const entryId of local.savedIds) {
      try {
        await api('/api/saves', { method: 'POST', body: JSON.stringify({ entryId }) })
      } catch {
        /* skip */
      }
    }
    for (const [entryId, value] of Object.entries(local.ratings)) {
      try {
        await api('/api/ratings', { method: 'PUT', body: JSON.stringify({ entryId, value }) })
      } catch {
        /* skip */
      }
    }
  }

  async function finishAuth(payload: AuthPayload) {
    storeToken(payload.token)
    await carryLocalOntoAccount()
    const fresh = await api<SessionPayload>('/api/bootstrap')
    adopt(fresh)
    setAuthOpen(false)
    setAuthError('')
    setToast(`Signed in as ${fresh.user?.name ?? 'you'}.`)
    if (shareAfterAuth) {
      setShareAfterAuth(false)
      setCompose(true)
    }
  }

  const entries = useMemo(() => {
    const seen = new Set<string>()
    const merged: Entry[] = []
    const personal = account ? [] : bag.posts
    for (const entry of [...sharedPosts, ...personal, ...catalog]) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      merged.push(entry)
    }
    return merged
  }, [account, bag.posts, sharedPosts])

  const shown = useMemo(() => visibleEntries(entries, section, query), [entries, query, section])
  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  )
  const hover = shown.find((entry) => entry.id === hoverId) ?? null
  const savedEntries = entries.filter((entry) => bag.savedIds.includes(entry.id))
  const yourPosts = entries.filter((entry) => account && entry.authorId === account.id)

  function pick(id: string) {
    setSelectedId(id)
    setHoverId(null)
    setScreen('explore')
  }

  function surprise() {
    const pool = shown.length > 0 ? shown : entries
    const next = pool[Math.floor(Math.random() * pool.length)]
    if (!next) return
    setSelectedId(next.id)
    setMode('globe')
    setScreen('explore')
  }

  function openAccount() {
    if (account) setScreen('profile')
    else {
      setAuthError('')
      setAuthOpen(true)
    }
  }

  function openShare() {
    if (!live) {
      setToast('The shared atlas is not reachable from here.')
      return
    }
    if (!account) {
      setAuthError('')
      setShareAfterAuth(true)
      setAuthOpen(true)
      return
    }
    setCompose(true)
  }

  async function toggleSave(entry: Entry) {
    const has = bag.savedIds.includes(entry.id)
    if (account) {
      try {
        if (has) await api(`/api/saves/${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
        else await api('/api/saves', { method: 'POST', body: JSON.stringify({ entryId: entry.id }) })
      } catch (error) {
        setToast(messageOf(error))
        return
      }
    }
    setBag((current) => ({
      ...current,
      savedIds: has ? current.savedIds.filter((id) => id !== entry.id) : [...current.savedIds, entry.id],
    }))
  }

  async function rate(entry: Entry, value: number) {
    if (account) {
      try {
        await api('/api/ratings', { method: 'PUT', body: JSON.stringify({ entryId: entry.id, value }) })
      } catch (error) {
        setToast(messageOf(error))
        return
      }
    }
    setBag((current) => ({ ...current, ratings: { ...current.ratings, [entry.id]: value } }))
  }

  async function sendMessage(entry: Entry, text: string) {
    const clean = text.trim()
    if (!clean) return
    if (account) {
      try {
        const result = await api<{ thread: Thread }>('/api/messages', {
          method: 'POST',
          body: JSON.stringify({ entryId: entry.id, text: clean, withName: entry.author }),
        })
        setBag((current) => {
          const exists = current.threads.some((thread) => thread.id === result.thread.id)
          const threads = exists
            ? current.threads.map((thread) => (thread.id === result.thread.id ? result.thread : thread))
            : [result.thread, ...current.threads]
          return { ...current, threads }
        })
        setToast(`Sent to ${entry.author}. It is on your account.`)
      } catch (error) {
        setToast(messageOf(error))
      }
      return
    }
    const threadId = `thread-${entry.id}`
    setBag((current) => {
      const mail = { id: crypto.randomUUID(), from: 'you' as const, text: clean, at: 'Just now' }
      const exists = current.threads.some((thread) => thread.id === threadId)
      const threads = exists
        ? current.threads.map((thread) =>
            thread.id === threadId ? { ...thread, messages: [...thread.messages, mail] } : thread,
          )
        : [{ id: threadId, entryId: entry.id, withName: entry.author, messages: [mail] }, ...current.threads]
      return { ...current, threads }
    })
    setToast('Saved on this device. Sign in to keep messages on your account.')
  }

  async function reply(thread: Thread, text: string) {
    const clean = text.trim()
    if (!clean) return
    if (account && live) {
      try {
        const result = await api<{ thread: Thread }>(`/api/threads/${encodeURIComponent(thread.id)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text: clean }),
        })
        setBag((current) => ({
          ...current,
          threads: current.threads.map((item) => (item.id === result.thread.id ? result.thread : item)),
        }))
      } catch (error) {
        setToast(messageOf(error))
      }
      return
    }
    setBag((current) => ({
      ...current,
      threads: current.threads.map((item) =>
        item.id === thread.id
          ? {
              ...item,
              messages: [...item.messages, { id: crypto.randomUUID(), from: 'you' as const, text: clean, at: 'Just now' }],
            }
          : item,
      ),
    }))
  }

  async function saveProfile(profile: Profile) {
    if (account) {
      try {
        const result = await api<{ user: Account }>('/api/me', { method: 'PATCH', body: JSON.stringify(profile) })
        setAccount(result.user)
        setBag((current) => ({ ...current, profile: accountProfile(result.user) }))
        setToast('Profile saved on your account.')
      } catch (error) {
        setToast(messageOf(error))
      }
      return
    }
    setBag((current) => ({ ...current, profile }))
    setToast('Profile saved on this device.')
  }

  async function addPost(draft: PostDraft) {
    try {
      const result = await api<{ entry: Entry }>('/api/posts', { method: 'POST', body: JSON.stringify(draft) })
      setSharedPosts((current) => [result.entry, ...current.filter((item) => item.id !== result.entry.id)])
      setCompose(false)
      setSelectedId(result.entry.id)
      setScreen('explore')
      setSection(result.entry.section)
      setQuery('')
      setToast('Pinned on the shared atlas.')
    } catch (error) {
      setToast(messageOf(error))
    }
  }

  async function removePost(id: string) {
    const entry = entries.find((item) => item.id === id)
    if (account && entry?.authorId === account.id) {
      try {
        await api(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
        setSharedPosts((current) => current.filter((item) => item.id !== id))
      } catch (error) {
        setToast(messageOf(error))
        return
      }
    }
    setBag((current) => ({
      ...current,
      posts: current.posts.filter((post) => post.id !== id),
      savedIds: current.savedIds.filter((saved) => saved !== id),
    }))
    setSelectedId(null)
    setToast('Pin removed.')
  }

  async function signOut() {
    try {
      if (authToken()) await api('/api/logout', { method: 'POST' })
    } catch {
      /* clearing the token still signs this browser out */
    }
    storeToken(null)
    setAccount(null)
    setBag(initialBag)
    setScreen('explore')
    setToast('Signed out on this browser.')
  }

  return (
    <div className="app">
      <div className="workspace">
        {screen === 'explore' ? (
          <>
            <div className="stage">
              {mode === 'list' || globeBroken ? (
                <AtlasList entries={shown} selectedId={selectedId} onSelect={pick} />
              ) : (
                <Suspense fallback={<p className="globe-fallback">Raising the globe…</p>}>
                  <GlobeBoundary
                    key={globeAttempt}
                    onFail={() => {
                      setGlobeBroken(true)
                      setMode('list')
                    }}
                  >
                    <GlobeScene entries={shown} selected={selected} onSelect={pick} onHover={setHoverId} />
                  </GlobeBoundary>
                </Suspense>
              )}
              {globeBroken && mode === 'globe' ? (
                <p className="globe-fallback">This browser could not draw the globe. The list still has every pin.</p>
              ) : null}
              <StageChrome
                section={section}
                onSection={setSection}
                mode={globeBroken ? 'list' : mode}
                onMode={(next) => {
                  if (next === 'globe' && globeBroken) {
                    setGlobeBroken(false)
                    setGlobeAttempt((n) => n + 1)
                  }
                  setMode(next)
                }}
                count={shown.length}
                hover={hover}
                onSurprise={surprise}
              />
            </div>
            {selected ? (
              <DetailSheet
                entry={selected}
                entries={entries}
                saved={bag.savedIds.includes(selected.id)}
                yourRating={bag.ratings[selected.id]}
                signedIn={Boolean(account)}
                owned={selected.origin === 'yours' || Boolean(account && selected.authorId === account.id)}
                onClose={() => setSelectedId(null)}
                onSave={() => void toggleSave(selected)}
                onRate={(value) => void rate(selected, value)}
                onSelect={pick}
                onMessage={(text) => void sendMessage(selected, text)}
                onRemove={() => void removePost(selected.id)}
              />
            ) : null}
          </>
        ) : null}
        {screen === 'inbox' ? (
          <InboxPanel
            threads={bag.threads}
            entries={entries}
            openId={openThreadId}
            onOpen={setOpenThreadId}
            onReply={(thread, text) => void reply(thread, text)}
          />
        ) : null}
        {screen === 'profile' ? (
          <ProfilePanel
            profile={bag.profile}
            posts={account ? yourPosts : bag.posts}
            saved={savedEntries}
            signedIn={Boolean(account)}
            onSave={(profile) => void saveProfile(profile)}
            onSelect={pick}
            onAccount={openAccount}
            onSignOut={() => void signOut()}
          />
        ) : null}
      </div>
      <TopBar
        query={query}
        onQuery={setQuery}
        results={shown}
        onPick={pick}
        screen={screen}
        onScreen={setScreen}
        onShare={openShare}
        accountLabel={account ? account.name : 'Sign in'}
        onAccount={openAccount}
      />
      <BottomNav
        screen={screen}
        accountLabel={account ? account.name : 'Sign in'}
        onScreen={setScreen}
        onAccount={openAccount}
      />
      {compose && account ? (
        <ComposeDialog profile={bag.profile} onClose={() => setCompose(false)} onCreate={(draft) => void addPost(draft)} />
      ) : null}
      {authOpen ? (
        <AuthDialog
          busy={authBusy}
          error={authError}
          onClose={() => {
            setAuthOpen(false)
            setShareAfterAuth(false)
          }}
          onLogin={(email, password) => {
            setAuthBusy(true)
            setAuthError('')
            api<AuthPayload>('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) })
              .then((payload) => finishAuth(payload))
              .catch((error: unknown) => setAuthError(messageOf(error)))
              .finally(() => setAuthBusy(false))
          }}
          onSignup={(input) => {
            setAuthBusy(true)
            setAuthError('')
            api<AuthPayload>('/api/signup', { method: 'POST', body: JSON.stringify(input) })
              .then((payload) => finishAuth(payload))
              .catch((error: unknown) => setAuthError(messageOf(error)))
              .finally(() => setAuthBusy(false))
          }}
        />
      ) : null}
      {toast ? (
        <p className="toast" role="status">
          {toast}
        </p>
      ) : null}
    </div>
  )
}
