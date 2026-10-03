import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Annotation, type Book } from '../lib/db'
import { highlightsMarkdown, shareMarkdown } from '../lib/export'
import Icon from '../components/Icon'
import { Segmented, toast } from '../components/ui'
import { HL_RGB } from '../readers/types'

export default function Notes() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const bookFilter = params.get('book')
  const typeFilter = params.get('type') === 'bookmark' ? 'bookmark' : 'highlights'
  const [view, setView] = useState<'all' | 'book'>('all')
  const [query, setQuery] = useState('')

  const books = useLiveQuery(async () => new Map((await db.books.toArray()).map((b) => [b.id, b])), [])
  const notes = useLiveQuery(
    () =>
      db.annotations
        .orderBy('createdAt')
        .reverse()
        .filter((a) => !a.deleted && (typeFilter === 'bookmark' ? a.type === 'bookmark' : a.type !== 'bookmark'))
        .toArray(),
    [typeFilter],
  )

  const filtered = useMemo(() => {
    let list = notes ?? []
    if (bookFilter) list = list.filter((a) => a.bookId === bookFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((a) =>
        [a.text, a.note, a.chapter, books?.get(a.bookId)?.title, ...a.tags].some((s) => s?.toLowerCase().includes(q)),
      )
    }
    return list
  }, [notes, bookFilter, query, books])

  const grouped = useMemo(() => {
    const m = new Map<string, Annotation[]>()
    for (const a of filtered) m.set(a.bookId, [...(m.get(a.bookId) ?? []), a])
    return [...m.entries()]
  }, [filtered])

  const scopedBook = bookFilter ? books?.get(bookFilter) : undefined
  const title = typeFilter === 'bookmark' ? 'Bookmarks' : 'Notes'
  const isTab = !bookFilter

  return (
    <div className="screen" style={isTab ? undefined : { paddingBottom: 40 }}>
      <div className="nav-row" style={{ justifyContent: isTab ? 'flex-end' : 'space-between' }}>
        {!isTab && (
          <button className="nav-back" onClick={() => navigate(-1)}>
            <Icon name="back" size={22} stroke={2.4} /> Back
          </button>
        )}
        {typeFilter !== 'bookmark' && (
          <button
            className="icon-btn filled"
            aria-label="Export highlights"
            onClick={async () => {
              if (!filtered.length) return toast('Nothing to export yet')
              await shareMarkdown(await highlightsMarkdown(bookFilter ?? undefined), scopedBook ? `${scopedBook.title} — Highlights` : 'Folio Highlights')
            }}
          >
            <Icon name="share" size={18} stroke={2} />
          </button>
        )}
      </div>
      <h1 className="large-title">{title}</h1>
      {scopedBook && (
        <p className="muted" style={{ margin: '-4px var(--gutter) 8px' }}>
          {scopedBook.title}{' '}
          <button className="link-btn" onClick={() => setParams({})}>
            Show all
          </button>
        </p>
      )}

      <label className="search-field">
        <Icon name="search" size={17} stroke={2} />
        <input type="search" placeholder="Search highlights, notes, tags" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {isTab && (
        <div style={{ margin: '4px var(--gutter) 14px' }}>
          <Segmented
            value={view}
            options={[
              { value: 'all', label: 'All' },
              { value: 'book', label: 'By Book' },
            ]}
            onChange={setView}
          />
        </div>
      )}

      {notes && filtered.length === 0 && (
        <div className="empty-state" style={{ paddingTop: 48 }}>
          <span className="empty-icon">
            <Icon name={typeFilter === 'bookmark' ? 'bookmark' : 'quote'} size={34} stroke={1.6} />
          </span>
          <h2>{query ? 'No matches' : typeFilter === 'bookmark' ? 'No bookmarks yet' : 'No highlights yet'}</h2>
          <p>
            {query
              ? 'Try a different word or tag.'
              : typeFilter === 'bookmark'
                ? 'Tap the bookmark icon while reading to save your place.'
                : 'Select text while reading to highlight it. Your highlights sync to Notion automatically.'}
          </p>
        </div>
      )}

      {view === 'all' || !isTab ? (
        <div className="note-list">
          {filtered.map((a) => (
            <NoteCard key={a.id} a={a} book={books?.get(a.bookId)} showBook={!bookFilter} />
          ))}
        </div>
      ) : (
        grouped.map(([bookId, list]) => (
          <section key={bookId}>
            <div className="section-title" style={{ fontSize: 17 }}>
              <span className="ellipsis">{books?.get(bookId)?.title ?? 'Unknown book'}</span>
              <span className="caption">{list.length}</span>
            </div>
            <div className="note-list">
              {list.map((a) => (
                <NoteCard key={a.id} a={a} book={books?.get(a.bookId)} showBook={false} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function NoteCard({ a, book, showBook }: { a: Annotation; book?: Book; showBook: boolean }) {
  const navigate = useNavigate()
  const open = () => navigate(`/read/${a.bookId}?loc=${encodeURIComponent(a.location)}`)
  if (a.type === 'bookmark') {
    return (
      <button className="note-card" onClick={open}>
        <span className="note-card-bar" style={{ background: 'var(--danger)' }} />
        <span className="note-card-body">
          <span className="note-card-quote" style={{ fontFamily: 'var(--font-ui)' }}>
            {a.chapter || 'Bookmark'}
          </span>
          <span className="caption">
            {showBook && book ? `${book.title} · ` : ''}
            {a.text}
          </span>
        </span>
      </button>
    )
  }
  return (
    <button className="note-card" onClick={open}>
      <span className="note-card-bar" style={{ background: HL_RGB[a.color ?? 'yellow'] }} />
      <span className="note-card-body">
        <span className="note-card-quote">“{a.text}”</span>
        {a.note && <span className="note-card-note">{a.note}</span>}
        {a.tags.length > 0 && (
          <span className="tag-row" style={{ margin: '2px 0 0' }}>
            {a.tags.map((t) => (
              <span key={t} className="tag-chip small">
                #{t}
              </span>
            ))}
          </span>
        )}
        <span className="note-card-meta caption">
          <span className="ellipsis">
            {showBook && book ? `${book.title}${a.chapter ? ' · ' : ''}` : ''}
            {a.chapter}
          </span>
          <span className="notion-badge" title={a.dirty ? 'Syncing' : 'Synced'}>
            N
          </span>
        </span>
      </span>
    </button>
  )
}
