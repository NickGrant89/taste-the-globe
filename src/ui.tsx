import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  AID_CAUTION,
  MARKET_CAUTION,
  cityChoices,
  motto,
  sectionMeta,
  sections,
  type Entry,
  type PostDraft,
  type Profile,
  type SectionId,
  type Thread,
} from './domain/model.ts'
import { nudgePin, relatedEntries } from './domain/query.ts'

function FoodPhoto({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const alive = useRef(false)

  useEffect(() => {
    alive.current = true
    setFailed(false)
    return () => {
      alive.current = false
    }
  }, [src])

  if (!src || failed) return <span className={`photo-fallback ${className ?? ''}`} aria-hidden="true" />
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      onError={() => {
        if (alive.current) setFailed(true)
      }}
    />
  )
}

export function TopBar({
  query,
  onQuery,
  results,
  onPick,
  screen,
  onScreen,
  onShare,
  accountLabel,
  onAccount,
}: {
  query: string
  onQuery: (value: string) => void
  results: Entry[]
  onPick: (id: string) => void
  screen: 'explore' | 'inbox' | 'profile'
  onScreen: (screen: 'explore' | 'inbox' | 'profile') => void
  onShare: () => void
  accountLabel: string
  onAccount: () => void
}) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const showResults = open && query.trim().length > 0

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (!formRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])

  function submit(event: FormEvent) {
    event.preventDefault()
    const first = results[0]
    if (!first) return
    onPick(first.id)
    setOpen(false)
  }

  return (
    <header className="top">
      <div className="brand">
        <strong>Taste the Globe</strong>
        <small>Illustrated atlas. Not a live food-aid list.</small>
      </div>
      <form className="search" onSubmit={submit} role="search" ref={formRef}>
        <input
          value={query}
          onChange={(event) => {
            onQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Dish, ingredient, or city"
          aria-label="Search dishes, ingredients, or cities"
          autoComplete="off"
        />
        {showResults && (
          <div className="results" role="listbox">
            {results.length === 0 && <p className="empty-results">Nothing under that name yet.</p>}
            {results.slice(0, 6).map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() => {
                  onPick(entry.id)
                  setOpen(false)
                }}
              >
                <FoodPhoto src={entry.photo} alt="" className="thumb" />
                <span>
                  <b>{entry.title}</b>
                  <span>
                    {sectionMeta(entry.section).label} · {entry.city}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </form>
      <nav className="nav desktop-nav" aria-label="Primary">
        <button type="button" aria-current={screen === 'explore' ? 'page' : undefined} onClick={() => onScreen('explore')}>
          Explore
        </button>
        <button type="button" aria-current={screen === 'inbox' ? 'page' : undefined} onClick={() => onScreen('inbox')}>
          Inbox
        </button>
        <button type="button" aria-current={screen === 'profile' ? 'page' : undefined} onClick={onAccount}>
          {accountLabel}
        </button>
      </nav>
      <button type="button" className="share" onClick={onShare}>
        Share food
      </button>
    </header>
  )
}

export function StageChrome({
  section,
  onSection,
  mode,
  onMode,
  count,
  hover,
  onSurprise,
}: {
  section: SectionId | 'all'
  onSection: (section: SectionId | 'all') => void
  mode: 'globe' | 'list'
  onMode: (mode: 'globe' | 'list') => void
  count: number
  hover: Entry | null
  onSurprise: () => void
}) {
  const active = section === 'all' ? null : sectionMeta(section)
  return (
    <div className="stage-ui">
      {mode === 'globe' && (
        <div className="quote-card">
          <p>{active ? active.label : 'The world is full of food.'}</p>
          <p className="blurb">{active ? active.blurb : 'Taste the Globe connects people to it.'}</p>
          <p className="count">
            {count} {count === 1 ? 'place' : 'places'}
            {hover ? ` · ${hover.title}, ${hover.city}` : ''}
          </p>
        </div>
      )}
      <div className="pills" role="toolbar" aria-label="Sections">
        <button type="button" className={section === 'all' ? 'active' : ''} onClick={() => onSection('all')}>
          All
        </button>
        {sections.map((item) => (
          <button
            type="button"
            key={item.id}
            className={section === item.id ? 'active' : ''}
            style={section === item.id ? { background: item.color } : undefined}
            onClick={() => onSection(item.id)}
          >
            <span className="dot" style={{ background: item.color }} />
            {item.label}
          </button>
        ))}
      </div>
      <div className="tools">
        <button type="button" aria-pressed={mode === 'globe'} onClick={() => onMode('globe')}>
          Globe
        </button>
        <button type="button" aria-pressed={mode === 'list'} onClick={() => onMode('list')}>
          List
        </button>
        <button type="button" onClick={onSurprise}>
          Surprise me
        </button>
      </div>
    </div>
  )
}

function Stars({
  value,
  onRate,
}: {
  value: number
  onRate: (value: number) => void
}) {
  return (
    <div className="stars" role="group" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          type="button"
          key={star}
          className={star <= value ? 'on' : ''}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          onClick={() => onRate(star)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export function DetailSheet({
  entry,
  entries,
  saved,
  yourRating,
  onClose,
  onSave,
  onRate,
  onSelect,
  onMessage,
  onRemove,
  signedIn,
  owned,
}: {
  entry: Entry
  entries: Entry[]
  saved: boolean
  yourRating?: number
  onClose: () => void
  onSave: () => void
  onRate: (value: number) => void
  onSelect: (id: string) => void
  onMessage: (text: string) => void
  onRemove: () => void
  signedIn: boolean
  owned: boolean
}) {
  const meta = sectionMeta(entry.section)
  const related = relatedEntries(entries, entry)
  const [note, setNote] = useState('')
  const sheetRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (sheetRef.current) sheetRef.current.scrollTop = 0
  }, [entry.id])

  return (
    <aside className="detail" aria-label="Selected place" ref={sheetRef}>
      <FoodPhoto src={entry.photo} alt={entry.title} className="hero" />
      <div className="detail-inner">
        <div className="sheet-top">
          <div>
            <p className="kicker">{meta.label}</p>
            <h2>{entry.title}</h2>
            <p className="place-line">
              {entry.city}, {entry.country}
            </p>
          </div>
          <button type="button" className="close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="chips">
          <span className="chip">Location linked</span>
          {entry.rating ? <span className="chip">Community rated</span> : null}
          {entry.origin === 'member' ? <span className="chip">On the shared atlas</span> : null}
          {entry.origin === 'yours' ? <span className="chip">On this device</span> : null}
        </div>
        <p className="summary">{entry.summary}</p>
        <p className="story">{entry.story}</p>
        <p className="byline">
          {entry.author} · {entry.authorPlace}
        </p>
        {entry.rating ? (
          <p className="community-rating">
            {entry.rating.toFixed(1)} from {entry.ratingCount} ratings
          </p>
        ) : null}
        <Stars value={yourRating ?? 0} onRate={onRate} />
        <p className="fine">
          {signedIn
            ? 'Your rating is kept on your account. Identity checks are still to be designed.'
            : 'Sign in to keep a rating. Identity checks are still to be designed.'}
        </p>
        {entry.pickup ? (
          <div className="collection">
            <h3>Collect</h3>
            <p>{entry.pickup.place}</p>
            <p>{entry.pickup.window}</p>
            <p className="fine">{entry.pickup.note}</p>
          </div>
        ) : null}
        {entry.caution ? (
          <p className={entry.section === 'free-food' ? 'caution strong' : 'caution'}>{entry.caution}</p>
        ) : null}
        <dl className="facts">
          {entry.facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        {entry.lines ? (
          <div className="lines">
            <h3>{entry.lines.heading}</h3>
            <ol>
              {entry.lines.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {related.length > 0 && (
          <div className="related">
            <h3>Other versions</h3>
            {related.map((other) => (
              <button type="button" key={other.id} onClick={() => onSelect(other.id)}>
                <FoodPhoto src={other.photo} alt="" className="thumb" />
                <span>
                  {other.title}
                  <span>
                    {other.city}, {other.country}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="actions">
          <button type="button" className="primary" onClick={onSave}>
            {saved ? 'Saved' : 'Save'}
          </button>
          {owned ? (
            <button type="button" className="ghost" onClick={onRemove}>
              Remove pin
            </button>
          ) : null}
        </div>
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            if (!note.trim()) return
            onMessage(note)
            setNote('')
          }}
        >
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={`Message ${entry.author}`}
            aria-label={`Message ${entry.author}`}
          />
          <button type="submit" className="primary">
            Send
          </button>
        </form>
        <p className="motto">{motto}</p>
      </div>
    </aside>
  )
}

export function AtlasList({
  entries,
  selectedId,
  onSelect,
}: {
  entries: Entry[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (entries.length === 0) {
    return <p className="list-empty">Nothing matches. Try a dish, a city, or clear the search.</p>
  }
  return (
    <div className="list">
      {entries.map((entry) => {
        const meta = sectionMeta(entry.section)
        return (
          <button
            type="button"
            key={entry.id}
            className={entry.id === selectedId ? 'card selected' : 'card'}
            style={{ borderTopColor: meta.color }}
            onClick={() => onSelect(entry.id)}
          >
            <FoodPhoto src={entry.photo} alt="" className="card-photo" />
            <span className="kicker">{meta.label}</span>
            <h3>{entry.title}</h3>
            <p className="card-place">
              {entry.city}, {entry.country}
            </p>
            <p>{entry.summary}</p>
          </button>
        )
      })}
    </div>
  )
}

export function ComposeDialog({
  profile,
  onClose,
  onCreate,
}: {
  profile: Profile
  onClose: () => void
  onCreate: (draft: PostDraft) => void
}) {
  const [section, setSection] = useState<SectionId>('recipes')
  const [title, setTitle] = useState('')
  const [cityLabel, setCityLabel] = useState('London, United Kingdom')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('')
  const [pickupPlace, setPickupPlace] = useState('')
  const [pickupWindow, setPickupWindow] = useState('')
  const [error, setError] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (title.trim().length < 3 || summary.trim().length < 12) {
      setError('Add a title and at least a sentence about the food.')
      return
    }
    if (section === 'marketplace' && (pickupPlace.trim().length < 3 || pickupWindow.trim().length < 3)) {
      setError('Say where to collect it, and when.')
      return
    }
    const city = cityChoices.find((choice) => `${choice.city}, ${choice.country}` === cityLabel)
    if (!city) return
    const pin = nudgePin(city.lat, city.lng, title.length + summary.length)
    onCreate({
      section,
      title: title.trim(),
      city: city.city,
      country: city.country,
      lat: pin.lat,
      lng: pin.lng,
      summary: summary.trim(),
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      pickup:
        section === 'marketplace'
          ? { place: pickupPlace.trim(), window: pickupWindow.trim() }
          : undefined,
    })
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="share-title">Share food</h2>
        <p className="fine">
          {profile.name.trim() || 'You'} · the pin goes on the shared atlas at the city you choose, under your account.
        </p>
        <label>
          Section
          <select value={section} onChange={(event) => setSection(event.target.value as SectionId)}>
            {sections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <label>
          City
          <select value={cityLabel} onChange={(event) => setCityLabel(event.target.value)}>
            {cityChoices.map((choice) => {
              const label = `${choice.city}, ${choice.country}`
              return (
                <option key={label} value={label}>
                  {label}
                </option>
              )
            })}
          </select>
        </label>
        <label>
          What is it
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} />
        </label>
        <label>
          Tags, separated by commas
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tomato, weeknight" />
        </label>
        {section === 'marketplace' ? (
          <>
            <label>
              Where to collect
              <input
                value={pickupPlace}
                onChange={(event) => setPickupPlace(event.target.value)}
                placeholder="The shed, the gate, the kitchen"
              />
            </label>
            <label>
              When
              <input
                value={pickupWindow}
                onChange={(event) => setPickupWindow(event.target.value)}
                placeholder="Saturday morning, or within the hour"
              />
            </label>
            <p className="caution">{MARKET_CAUTION}</p>
          </>
        ) : null}
        {section === 'free-food' ? (
          <p className="caution strong">
            {AID_CAUTION} Do not add a real food-aid location in this build.
          </p>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="actions">
          <button type="submit" className="primary">
            Pin it
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export function InboxPanel({
  threads,
  entries,
  openId,
  onOpen,
  onReply,
}: {
  threads: Thread[]
  entries: Entry[]
  openId: string | null
  onOpen: (id: string | null) => void
  onReply: (thread: Thread, text: string) => void
}) {
  const open = threads.find((thread) => thread.id === openId) ?? null
  const [draft, setDraft] = useState('')

  if (open) {
    const entry = entries.find((item) => item.id === open.entryId)
    return (
      <section className="page">
        <button type="button" className="ghost back" onClick={() => onOpen(null)}>
          All messages
        </button>
        <h2>{open.withName}</h2>
        <p className="fine">{entry ? `${entry.title} · ${entry.city}` : 'That pin was removed from this device.'}</p>
        <div className="messages">
          {open.messages.map((mail) => (
            <article key={mail.id} className={`message ${mail.from}`}>
              <p>{mail.text}</p>
              <span>{mail.at}</span>
            </article>
          ))}
        </div>
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            onReply(open, draft)
            setDraft('')
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`Reply to ${open.withName}`}
            placeholder="Write a reply"
          />
          <button type="submit" className="primary">
            Send
          </button>
        </form>
      </section>
    )
  }

  return (
    <section className="page">
      <h2>Inbox</h2>
      <p className="lede">A message is how a pin becomes a person. On an account, it follows you to the next browser.</p>
      {threads.length === 0 ? (
        <p>Nothing here yet. Open a pin and send a note.</p>
      ) : (
        <div className="thread-list">
          {threads.map((thread) => {
            const entry = entries.find((item) => item.id === thread.entryId)
            const last = thread.messages[thread.messages.length - 1]
            return (
              <button type="button" key={thread.id} onClick={() => onOpen(thread.id)}>
                <b>{thread.withName}</b>
                <span>{entry ? `${entry.title} · ${entry.city}` : 'Pin removed'}</span>
                <p>{last?.text}</p>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function ProfilePanel({
  profile,
  posts,
  saved,
  signedIn,
  onSave,
  onSelect,
  onAccount,
  onSignOut,
}: {
  profile: Profile
  posts: Entry[]
  saved: Entry[]
  signedIn: boolean
  onSave: (profile: Profile) => void
  onSelect: (id: string) => void
  onAccount: () => void
  onSignOut: () => void
}) {
  const [draft, setDraft] = useState(profile)
  const cityLabel = `${draft.city}, ${draft.country}`

  useEffect(() => {
    setDraft(profile)
  }, [profile])

  return (
    <section className="page">
      <h2>{signedIn ? profile.name : 'You'}</h2>
      <p className="lede">
        {signedIn
          ? 'Your name, home city, and the food you have touched. Verification of identity is planned, not built.'
          : 'Sign in to keep pins and messages on the shared atlas. Anyone with the link can already look around.'}
      </p>
      {signedIn ? null : (
        <button type="button" className="primary" onClick={onAccount}>
          Create an account
        </button>
      )}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          const city = cityChoices.find((choice) => `${choice.city}, ${choice.country}` === cityLabel)
          onSave({
            name: draft.name.trim() || 'You',
            city: city?.city ?? draft.city,
            country: city?.country ?? draft.country,
            bio: draft.bio.trim(),
          })
        }}
      >
        <label>
          Name
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label>
          Home city
          <select
            value={cityChoices.some((choice) => `${choice.city}, ${choice.country}` === cityLabel) ? cityLabel : 'London, United Kingdom'}
            onChange={(event) => {
              const [city, country] = event.target.value.split(', ')
              setDraft({ ...draft, city: city ?? draft.city, country: country ?? draft.country })
            }}
          >
            {cityChoices.map((choice) => {
              const label = `${choice.city}, ${choice.country}`
              return (
                <option key={label} value={label}>
                  {label}
                </option>
              )
            })}
          </select>
        </label>
        <label>
          Bio
          <textarea
            value={draft.bio}
            rows={3}
            onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
            placeholder="What you cook, grow, or go looking for"
          />
        </label>
        <div className="actions">
          <button type="submit" className="primary">
            Save profile
          </button>
          {signedIn ? (
            <button type="button" className="ghost" onClick={onSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </form>
      <p className="fine">Some sample photographs are from Wikimedia Commons and Unsplash.</p>
      <h3>Your pins</h3>
      {posts.length === 0 ? <p>You have not shared any food yet.</p> : <MiniList entries={posts} onSelect={onSelect} />}
      <h3>Saved</h3>
      {saved.length === 0 ? <p>Save a pin from the globe and it will wait here.</p> : <MiniList entries={saved} onSelect={onSelect} />}
      <p className="motto">{motto}</p>
    </section>
  )
}

function MiniList({ entries, onSelect }: { entries: Entry[]; onSelect: (id: string) => void }) {
  return (
    <div className="thread-list">
      {entries.map((entry) => (
        <button type="button" key={entry.id} onClick={() => onSelect(entry.id)}>
          <b>{entry.title}</b>
          <span>
            {entry.city}, {entry.country}
          </span>
        </button>
      ))}
    </div>
  )
}

export function AuthDialog({
  busy,
  error,
  onClose,
  onLogin,
  onSignup,
}: {
  busy: boolean
  error: string
  onClose: () => void
  onLogin: (email: string, password: string) => void
  onSignup: (input: { email: string; password: string; name: string; city: string; country: string }) => void
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [cityLabel, setCityLabel] = useState('London, United Kingdom')

  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (mode === 'login') onLogin(email.trim(), password)
          else {
            const city = cityChoices.find((choice) => `${choice.city}, ${choice.country}` === cityLabel)
            onSignup({
              email: email.trim(),
              password,
              name: name.trim(),
              city: city?.city ?? 'London',
              country: city?.country ?? 'United Kingdom',
            })
          }
        }}
      >
        <h2 id="auth-title">{mode === 'signup' ? 'Create an account' : 'Sign in'}</h2>
        <p className="fine">
          An account keeps your pins, saves, and messages on the shared atlas. It is not an identity check.
        </p>
        <div className="auth-switch">
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>
            Create
          </button>
          <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
            Sign in
          </button>
        </div>
        {mode === 'signup' ? (
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
        ) : null}
        <label>
          Email
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            autoFocus={mode === 'login'}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {mode === 'signup' ? (
          <label>
            Home city
            <select value={cityLabel} onChange={(event) => setCityLabel(event.target.value)}>
              {cityChoices.map((choice) => {
                const label = `${choice.city}, ${choice.country}`
                return (
                  <option key={label} value={label}>
                    {label}
                  </option>
                )
              })}
            </select>
          </label>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export function BottomNav({
  screen,
  accountLabel,
  onScreen,
  onAccount,
}: {
  screen: 'explore' | 'inbox' | 'profile'
  accountLabel: string
  onScreen: (screen: 'explore' | 'inbox' | 'profile') => void
  onAccount: () => void
}) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <button type="button" aria-current={screen === 'explore' ? 'page' : undefined} onClick={() => onScreen('explore')}>
        Explore
      </button>
      <button type="button" aria-current={screen === 'inbox' ? 'page' : undefined} onClick={() => onScreen('inbox')}>
        Inbox
      </button>
      <button type="button" aria-current={screen === 'profile' ? 'page' : undefined} onClick={onAccount}>
        {accountLabel}
      </button>
    </nav>
  )
}
