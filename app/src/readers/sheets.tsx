import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Annotation, type BookFormat } from '../lib/db'
import { scheduleSync } from '../lib/sync'
import { FONT_STACKS, setSettings, useSettings, type ReaderFont, type ThemeChoice } from '../lib/settings'
import Icon from '../components/Icon'
import { Segmented, Sheet, Switch } from '../components/ui'
import { HL_COLORS, HL_RGB, type SearchHit, type TocItem } from './types'

const THEMES: { key: ThemeChoice; label: string; bg: string; ink: string }[] = [
  { key: 'light', label: 'Light', bg: '#ffffff', ink: '#1c1c1e' },
  { key: 'sepia', label: 'Sepia', bg: '#f4ead7', ink: '#3b2f25' },
  { key: 'dark', label: 'Dark', bg: '#1c1c1e', ink: '#e5e5e7' },
  { key: 'black', label: 'Black', bg: '#000000', ink: '#d1d1d6' },
  { key: 'auto', label: 'Auto', bg: 'linear-gradient(135deg,#fff 50%,#1c1c1e 50%)', ink: '#8e8e93' },
]

export function AppearanceSheet({
  format,
  pdfView,
  onPdfView,
  onClose,
}: {
  format: BookFormat
  pdfView?: 'text' | 'pages'
  onPdfView?: (v: 'text' | 'pages') => void
  onClose: () => void
}) {
  const s = useSettings()
  const epub = format === 'epub'
  return (
    <Sheet title="Appearance" onClose={onClose}>
      {pdfView && onPdfView && (
        <>
          <Segmented
            value={pdfView}
            options={[
              { value: 'text', label: 'Text' },
              { value: 'pages', label: 'Original Pages' },
            ]}
            onChange={(v) => {
              onPdfView(v)
              onClose()
            }}
          />
          <p className="caption" style={{ margin: '8px 4px 16px' }}>
            {pdfView === 'text'
              ? 'Reflowed to fit your screen and theme. Switch to Original Pages for diagrams and tables.'
              : 'Exactly as printed. Switch to Text for easier reading on your phone.'}
          </p>
        </>
      )}
      <div className="theme-swatches">
        {THEMES.map((t) => (
          <button key={t.key} className={`theme-swatch${s.theme === t.key ? ' on' : ''}`} onClick={() => setSettings({ theme: t.key })}>
            <span className="swatch" style={{ background: t.bg, color: t.ink }}>
              Aa
            </span>
            <span className="caption">{t.label}</span>
          </button>
        ))}
      </div>

      {epub && (
        <>
          <div className="stepper-row">
            <button className="stepper-btn" onClick={() => setSettings({ fontSize: Math.max(70, s.fontSize - 10) })} aria-label="Smaller text">
              <span style={{ fontSize: 14 }}>A</span>
            </button>
            <div className="stepper-track">
              <input
                type="range"
                min={70}
                max={220}
                step={5}
                value={s.fontSize}
                onChange={(e) => setSettings({ fontSize: Number(e.target.value) })}
                aria-label="Text size"
                style={{ ['--pct' as string]: `${((s.fontSize - 70) / 150) * 100}%` }}
                className="scrubber"
              />
            </div>
            <button className="stepper-btn" onClick={() => setSettings({ fontSize: Math.min(220, s.fontSize + 10) })} aria-label="Larger text">
              <span style={{ fontSize: 22 }}>A</span>
            </button>
          </div>

          <div className="font-grid">
            {(Object.keys(FONT_STACKS) as ReaderFont[]).map((f) => (
              <button key={f} className={`font-chip${s.font === f ? ' on' : ''}`} onClick={() => setSettings({ font: f })}>
                <span style={{ fontFamily: FONT_STACKS[f].css, fontSize: 20 }}>Aa</span>
                <span className="caption">{FONT_STACKS[f].label}</span>
              </button>
            ))}
          </div>

          <p className="sheet-label">Line Spacing</p>
          <Segmented
            value={String(s.lineHeight)}
            options={[
              { value: '1.45', label: 'Compact' },
              { value: '1.6', label: 'Normal' },
              { value: '1.8', label: 'Relaxed' },
            ]}
            onChange={(v) => setSettings({ lineHeight: Number(v) })}
          />
          <p className="sheet-label">Margins</p>
          <Segmented
            value={String(s.margin)}
            options={[
              { value: '20', label: 'Narrow' },
              { value: '30', label: 'Normal' },
              { value: '42', label: 'Wide' },
            ]}
            onChange={(v) => setSettings({ margin: Number(v) })}
          />
        </>
      )}

      <p className="sheet-label">Page Turn</p>
      <Segmented
        value={s.pageTurn}
        options={[
          { value: 'slide', label: 'Slide' },
          { value: 'scroll', label: 'Scroll' },
        ]}
        onChange={(v) => setSettings({ pageTurn: v })}
      />

      <div className="group" style={{ margin: '20px 0 8px' }}>
        {epub ? (
          <>
            <div className="row no-icon static">
              <span className="row-label">Justify Text</span>
              <Switch checked={s.justify} onChange={(v) => setSettings({ justify: v })} label="Justify text" />
            </div>
            <div className="row no-icon static">
              <span className="row-label">Original Publisher Font</span>
              <Switch checked={s.publisherStyles} onChange={(v) => setSettings({ publisherStyles: v })} label="Publisher styles" />
            </div>
          </>
        ) : (
          <div className="row no-icon static">
            <span className="row-label">Crop Page Margins</span>
            <Switch checked={s.pdfCrop} onChange={(v) => setSettings({ pdfCrop: v })} label="Crop margins" />
          </div>
        )}
      </div>
    </Sheet>
  )
}

export function ContentsSheet({
  toc,
  annotations,
  currentChapter,
  onGo,
  onClose,
}: {
  toc: TocItem[]
  annotations: Annotation[]
  currentChapter?: string
  onGo: (loc: string) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'contents' | 'bookmarks' | 'highlights'>('contents')
  const bookmarks = annotations.filter((a) => a.type === 'bookmark')
  const highlights = annotations.filter((a) => a.type !== 'bookmark')
  return (
    <Sheet title="" onClose={onClose} right={<span />}>
      <div style={{ margin: '-6px 0 12px' }}>
        <Segmented
          value={tab}
          options={[
            { value: 'contents', label: 'Contents' },
            { value: 'bookmarks', label: `Bookmarks${bookmarks.length ? ` (${bookmarks.length})` : ''}` },
            { value: 'highlights', label: `Highlights${highlights.length ? ` (${highlights.length})` : ''}` },
          ]}
          onChange={setTab}
        />
      </div>
      <div className="list-plain">
        {tab === 'contents' &&
          (toc.length ? (
            toc.map((t, i) => (
              <button key={i} className="toc-row" style={{ paddingLeft: 4 + t.depth * 16 }} onClick={() => onGo(t.href)}>
                {t.label === currentChapter && <span className="toc-dot" />}
                <span className={t.label === currentChapter ? 'toc-label current' : 'toc-label'}>{t.label}</span>
              </button>
            ))
          ) : (
            <p className="muted list-empty">This book has no table of contents.</p>
          ))}
        {tab === 'bookmarks' &&
          (bookmarks.length ? (
            bookmarks.map((b) => (
              <button key={b.id} className="toc-row" onClick={() => onGo(b.location)}>
                <Icon name="bookmark" size={16} fill className="accent" />
                <span className="toc-label">
                  {b.chapter || 'Bookmark'}
                  <span className="caption" style={{ display: 'block' }}>
                    {b.text} · {new Date(b.createdAt).toLocaleDateString()}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="muted list-empty">Tap the bookmark icon while reading to save your place.</p>
          ))}
        {tab === 'highlights' &&
          (highlights.length ? (
            highlights.map((h) => (
              <button key={h.id} className="hl-row" onClick={() => onGo(h.location)}>
                <span className="hl-bar" style={{ background: HL_RGB[h.color ?? 'yellow'] }} />
                <span>
                  <span className="hl-quote">{h.text}</span>
                  {h.note && <span className="hl-note">{h.note}</span>}
                  <span className="caption">{h.chapter}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="muted list-empty">Select text while reading to highlight it.</p>
          ))}
      </div>
    </Sheet>
  )
}

export function SearchSheet({
  search,
  onGo,
  onClose,
}: {
  search: (q: string) => Promise<SearchHit[]>
  onGo: (loc: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    if (!q.trim()) return
    setBusy(true)
    setHits(await search(q))
    setBusy(false)
  }

  const mark = (text: string) => {
    const i = text.toLowerCase().indexOf(q.trim().toLowerCase())
    if (i < 0) return text
    return (
      <>
        {text.slice(0, i)}
        <mark>{text.slice(i, i + q.trim().length)}</mark>
        {text.slice(i + q.trim().length)}
      </>
    )
  }

  return (
    <Sheet title="Search in Book" onClose={onClose}>
      <form onSubmit={run}>
        <label className="search-field" style={{ margin: '0 0 12px' }}>
          <Icon name="search" size={17} stroke={2} />
          <input ref={input} type="search" enterKeyHint="search" placeholder="Words or phrases" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </form>
      {busy && <p className="muted list-empty">Searching…</p>}
      {!busy && hits && (
        <>
          <p className="caption" style={{ margin: '0 4px 8px' }}>
            {hits.length === 200 ? '200+ results' : `${hits.length} result${hits.length === 1 ? '' : 's'}`}
          </p>
          <div className="list-plain">
            {hits.map((h, i) => (
              <button key={i} className="search-hit" onClick={() => onGo(h.location)}>
                {h.chapter && <span className="caption">{h.chapter}</span>}
                <span className="search-excerpt">{mark(h.excerpt)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  )
}

export function NoteSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const a = useLiveQuery(() => db.annotations.get(id), [id])
  const book = useLiveQuery(() => (a ? db.books.get(a.bookId) : undefined), [a?.bookId])
  const [note, setNote] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const allTags = useLiveQuery(async () => {
    const all = await db.annotations.toArray()
    return [...new Set(all.flatMap((x) => x.tags))].sort()
  }, [])
  const text = note ?? a?.note ?? ''

  const suggestions = useMemo(
    () => (allTags ?? []).filter((t) => !a?.tags.includes(t) && t.toLowerCase().startsWith(tagInput.toLowerCase())).slice(0, 6),
    [allTags, a?.tags, tagInput],
  )

  if (!a) return null

  async function patch(p: Partial<Annotation>) {
    await db.annotations.update(id, { ...p, updatedAt: Date.now(), dirty: 1 })
    scheduleSync()
  }

  async function close() {
    if (note !== null && note !== (a?.note ?? '')) await patch({ note: note.trim() || undefined, type: note.trim() ? 'note' : 'highlight' })
    onClose()
  }

  function addTag(t: string) {
    const tag = t.trim().replace(/^#/, '')
    if (!tag || a!.tags.includes(tag)) return
    void patch({ tags: [...a!.tags, tag] })
    setTagInput('')
  }

  return (
    <Sheet
      title="Note"
      onClose={close}
      right={
        <button className="link-btn strong" onClick={close}>
          Done
        </button>
      }
    >
      <blockquote className="note-quote" style={{ borderColor: HL_RGB[a.color ?? 'yellow'] }}>
        {a.text}
        <span className="caption">
          {book?.title}
          {a.chapter ? ` · ${a.chapter}` : ''}
        </span>
      </blockquote>

      <textarea className="note-input" placeholder="Add a note…" value={text} onChange={(e) => setNote(e.target.value)} rows={4} />

      <div className="tag-row">
        {a.tags.map((t) => (
          <button key={t} className="tag-chip on" onClick={() => void patch({ tags: a.tags.filter((x) => x !== t) })}>
            #{t} <Icon name="close" size={10} stroke={3} />
          </button>
        ))}
        <input
          className="tag-input"
          placeholder="Add tag"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addTag(tagInput)
            }
          }}
          onBlur={() => tagInput && addTag(tagInput)}
        />
      </div>
      {tagInput && suggestions.length > 0 && (
        <div className="tag-row">
          {suggestions.map((t) => (
            <button key={t} className="tag-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => addTag(t)}>
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="note-colors">
        {HL_COLORS.map((c) => (
          <button
            key={c}
            className={`sel-dot big${a.color === c ? ' on' : ''}`}
            style={{ background: HL_RGB[c] }}
            onClick={() => void patch({ color: c })}
            aria-label={`Change to ${c}`}
          />
        ))}
        <button
          className="note-delete"
          onClick={async () => {
            await patch({ deleted: 1 })
            onClose()
          }}
        >
          <Icon name="trash" size={18} /> Delete
        </button>
      </div>

      <p className="sync-line">
        <Icon name={a.dirty ? 'cloud' : 'check'} size={15} stroke={2.2} />
        {a.dirty ? 'Saving…' : 'Saved · syncs to Notion automatically'}
      </p>
    </Sheet>
  )
}
