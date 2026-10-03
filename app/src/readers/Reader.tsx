import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, logReading, type Annotation, type HighlightColor } from '../lib/db'
import { downloadBookFile, scheduleSync } from '../lib/sync'
import { useSettings } from '../lib/settings'
import Icon from '../components/Icon'
import { toast, formatDuration } from '../components/ui'
import EpubEngine from './EpubEngine'
import PdfEngine from './PdfEngine'
import { AppearanceSheet, ContentsSheet, NoteSheet, SearchSheet } from './sheets'
import { HL_COLORS, HL_RGB, type EngineHandle, type Relocation, type Selection, type TocItem } from './types'

type SheetKind = 'appearance' | 'contents' | 'search' | null

export default function Reader() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const engine = useRef<EngineHandle>(null)

  const book = useLiveQuery(() => db.books.get(id), [id])
  const file = useLiveQuery(() => db.files.get(id), [id])
  const [initial, setInitial] = useState<string | undefined | null>(null)
  const annotations = useLiveQuery(
    () => db.annotations.where('bookId').equals(id).filter((a) => !a.deleted).sortBy('createdAt'),
    [id],
    [] as Annotation[],
  )

  const [toc, setToc] = useState<TocItem[]>([])
  const [loc, setLoc] = useState<Relocation | null>(null)
  const [chrome, setChrome] = useState(true)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  /* Surface anything that goes wrong while the book is open instead of leaving a blank page. */
  const describe = (e: unknown) =>
    e instanceof Error ? `${e.name}: ${e.message}` : typeof e === 'string' ? e : JSON.stringify(e)
  useEffect(() => {
    const onRejection = (ev: PromiseRejectionEvent) => setError((cur) => cur ?? describe(ev.reason))
    const onErr = (ev: ErrorEvent) => setError((cur) => cur ?? describe(ev.error ?? ev.message))
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onErr)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onErr)
    }
  }, [])
  const relocated = useRef(false)
  const stageRef = useRef('')
  useEffect(() => {
    const t = setTimeout(() => {
      if (!relocated.current) setError((cur) => cur ?? `Timed out at: ${stageRef.current}`)
    }, 25000)
    return () => clearTimeout(t)
  }, [])

  /* A book whose file never made it into storage: fetch it from the backup if there is one. */
  const [fileMissing, setFileMissing] = useState(false)
  useEffect(() => {
    db.files.get(id).then(async (f) => {
      if (f) return
      setFileMissing(true)
      const b = await db.books.get(id)
      if (b?.backedUp && !downloading) {
        setDownloading(true)
        downloadBookFile(b)
          .catch((e) => setError(describe(e)))
          .finally(() => setDownloading(false))
      } else if (b) setError('This book’s file isn’t stored on this iPhone. Remove it and import it again.')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /* initial location (deep link > saved progress) + mark opened */
  const [params] = useSearchParams()
  useEffect(() => {
    const deep = params.get('loc')
    if (deep) setInitial(deep)
    else db.progress.get(id).then((p) => setInitial(p?.location || undefined))
    db.books.update(id, { lastOpenedAt: Date.now() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /* deep link from library search: jump to the nth match of `find` in section `href` */
  const findDone = useRef(false)
  function onReady(items: TocItem[]) {
    setToc(items)
    const find = params.get('find')
    if (!find || findDone.current) return
    findDone.current = true
    const href = params.get('href') ?? ''
    const nth = Number(params.get('nth') ?? 0)
    window.setTimeout(async () => {
      const hits = (await engine.current?.search(find)) ?? []
      const inSection = hits.filter((h) => !href || h.href === href)
      const hit = inSection[nth] ?? inSection[0] ?? hits[0]
      if (hit) engine.current?.goTo(hit.location)
    }, 300)
  }

  /* fetch file from cloud if needed */
  useEffect(() => {
    if (!book || book.hasFile || downloading) return
    setDownloading(true)
    downloadBookFile(book)
      .catch((e) => toast(e.message || 'Download failed'))
      .finally(() => setDownloading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.hasFile])

  /* hide chrome a moment after opening */
  useEffect(() => {
    const t = setTimeout(() => setChrome(false), 1800)
    return () => clearTimeout(t)
  }, [])

  /* reading-time tracking + pace (seconds per page) */
  const pace = useRef(55)
  useEffect(() => {
    try {
      pace.current = Number(localStorage.getItem('folio.pace')) || 55
    } catch {
      /* storage unavailable */
    }
  }, [])
  const lastTurn = useRef(Date.now())
  const pending = useRef(0)
  useEffect(() => {
    let last = Date.now()
    const tick = () => {
      const now = Date.now()
      if (document.visibilityState === 'visible') pending.current += Math.min(30, (now - last) / 1000)
      last = now
    }
    const iv = setInterval(() => {
      tick()
      if (pending.current >= 30) {
        void logReading(id, Math.round(pending.current))
        pending.current = 0
      }
    }, 5000)
    return () => {
      clearInterval(iv)
      tick()
      void logReading(id, Math.round(pending.current))
    }
  }, [id])

  /* keep screen awake while reading */
  useEffect(() => {
    if (!settings.keepAwake || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const acquire = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => {})
    void acquire()
    const onVis = () => document.visibilityState === 'visible' && void acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release()
    }
  }, [settings.keepAwake])

  const onRelocate = useCallback(
    (r: Relocation) => {
      const now = Date.now()
      const dt = (now - lastTurn.current) / 1000
      lastTurn.current = now
      if (dt > 8 && dt < 240) {
        pace.current = pace.current * 0.85 + dt * 0.15
        try {
          localStorage.setItem('folio.pace', String(Math.round(pace.current)))
        } catch {
          /* ignore */
        }
      }
      relocated.current = true
      setLoc(r)
      setSelection(null)
      void db.progress.put({ bookId: id, location: r.location, percent: r.percent, chapter: r.chapter, updatedAt: now, dirty: 1 })
      scheduleSync(4000)
    },
    [id],
  )

  const bookmarkHere = useMemo(
    () => annotations.find((a) => a.type === 'bookmark' && loc && a.location === loc.location),
    [annotations, loc],
  )

  async function toggleBookmark() {
    if (!loc) return
    if (bookmarkHere) {
      await db.annotations.update(bookmarkHere.id, { deleted: 1, dirty: 1, updatedAt: Date.now() })
      toast('Bookmark removed')
    } else {
      const now = Date.now()
      await db.annotations.add({
        id: crypto.randomUUID(),
        bookId: id,
        type: 'bookmark',
        location: loc.location,
        chapter: loc.chapter,
        text: loc.pageLabel,
        tags: [],
        createdAt: now,
        updatedAt: now,
        dirty: 1,
      })
      toast('Bookmarked')
    }
    scheduleSync()
  }

  async function highlight(color: HighlightColor, openNote = false) {
    if (!selection) return
    const now = Date.now()
    const a: Annotation = {
      id: crypto.randomUUID(),
      bookId: id,
      type: 'highlight',
      location: selection.location,
      text: selection.text,
      color,
      chapter: loc?.chapter,
      tags: [],
      createdAt: now,
      updatedAt: now,
      dirty: 1,
    }
    await db.annotations.add(a)
    engine.current?.clearSelection()
    setSelection(null)
    scheduleSync()
    if (openNote) setNoteFor(a.id)
  }

  async function copySelection() {
    if (!selection) return
    try {
      await navigator.clipboard.writeText(selection.text)
      toast('Copied')
    } catch {
      toast('Copy not available')
    }
    engine.current?.clearSelection()
    setSelection(null)
  }

  async function shareSelection() {
    if (!selection || !book) return
    const text = `“${selection.text}”\n— ${book.title}${book.author ? `, ${book.author}` : ''}`
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        toast('Quote copied')
      }
    } catch {
      /* cancelled */
    }
  }

  if (book === undefined) return <div className="reader" />
  if (book === null)
    return (
      <div className="reader center-msg">
        <p>This book is no longer in your library.</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to Library
        </button>
      </div>
    )

  const minutesLeft = loc?.pagesLeft !== undefined ? (loc.pagesLeft * pace.current) / 60 : undefined
  const pct = Math.round((scrub ?? loc?.percent ?? 0) * 100)
  const Engine = book.format === 'pdf' ? PdfEngine : EpubEngine
  const ready = file && initial !== null
  const stage = !file
    ? fileMissing
      ? book.backedUp
        ? 'Downloading from your backup…'
        : 'This book’s file is missing on this iPhone.'
      : downloading
        ? 'Downloading from your backup…'
        : 'Reading book from storage…'
    : initial === null
      ? 'Restoring your place…'
      : `Laying out pages… (${(file.blob.size / 1048576).toFixed(1)} MB)`
  stageRef.current = stage

  return (
    <div className={`reader ${chrome ? 'chrome-on' : ''}`}>
      {ready ? (
        <Engine
          ref={engine}
          data={file.blob}
          initialLocation={initial ?? undefined}
          annotations={annotations}
          onReady={onReady}
          onRelocate={onRelocate}
          onSelect={(s) => {
            setSelection(s)
            if (s) setChrome(false)
          }}
          onTapCenter={() => setChrome((c) => !c)}
          onHighlightTap={(hid) => setNoteFor(hid)}
          onError={(e) => setError(describe(e))}
        />
      ) : (
        <div className="center-msg">
          <div className="spinner" />
          <p className="muted">{stage}</p>
        </div>
      )}
      {ready && !loc && !error && (
        <div className="center-msg reader-opening">
          <div className="spinner" />
          <p className="muted">{stage}</p>
        </div>
      )}

      {/* Top bar */}
      <header className="reader-top">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back to library">
          <Icon name="back" size={24} stroke={2.2} />
        </button>
        <div className="reader-title">
          <div className="reader-title-main">{book.title}</div>
          {book.author && <div className="reader-title-sub">{book.author}</div>}
        </div>
        <div className="reader-actions">
          <button className="icon-btn" onClick={() => setSheet('contents')} aria-label="Contents">
            <Icon name="list" size={22} />
          </button>
          <button className="icon-btn" onClick={() => setSheet('search')} aria-label="Search in book">
            <Icon name="search" size={21} />
          </button>
          <button className="icon-btn" onClick={() => setSheet('appearance')} aria-label="Appearance">
            <Icon name="textformat" size={22} />
          </button>
          <button className="icon-btn" onClick={toggleBookmark} aria-label={bookmarkHere ? 'Remove bookmark' : 'Add bookmark'}>
            <Icon name="bookmark" size={21} fill={!!bookmarkHere} />
          </button>
        </div>
      </header>

      {bookmarkHere && !chrome && <div className="bookmark-ribbon" aria-hidden="true" />}

      {/* Bottom bar */}
      <footer className="reader-bottom">
        <div className="reader-bottom-row">
          <span className="caption ellipsis">{loc?.chapter ?? ' '}</span>
          <span className="caption">{pct}%</span>
        </div>
        <input
          className="scrubber"
          type="range"
          min={0}
          max={1000}
          value={Math.round((scrub ?? loc?.percent ?? 0) * 1000)}
          style={{ ['--pct' as string]: `${pct}%` }}
          onChange={(e) => setScrub(Number(e.target.value) / 1000)}
          onPointerUp={() => {
            if (scrub !== null) engine.current?.goToPercent(scrub)
            setScrub(null)
          }}
          onTouchEnd={() => {
            if (scrub !== null) engine.current?.goToPercent(scrub)
            setScrub(null)
          }}
          aria-label="Position in book"
        />
        <div className="reader-bottom-row">
          <span className="caption">{loc?.pageLabel ?? ''}</span>
          <span className="caption">
            {minutesLeft !== undefined
              ? `${formatDuration(minutesLeft)} left in ${book.format === 'pdf' ? 'book' : 'chapter'}`
              : ''}
          </span>
        </div>
      </footer>

      {/* Quiet footer when chrome is hidden */}
      {!chrome && loc && (
        <div className="reader-quiet caption">
          {loc.pageLabel}
          {minutesLeft !== undefined && ` · ${formatDuration(minutesLeft)} left in ${book.format === 'pdf' ? 'book' : 'chapter'}`}
        </div>
      )}

      {/* Selection menu */}
      {selection && <SelectionMenu sel={selection} onColor={highlight} onNote={() => highlight('yellow', true)} onCopy={copySelection} onShare={shareSelection} />}

      {sheet === 'appearance' && <AppearanceSheet format={book.format} onClose={() => setSheet(null)} />}
      {sheet === 'contents' && (
        <ContentsSheet
          toc={toc}
          annotations={annotations}
          currentChapter={loc?.chapter}
          onClose={() => setSheet(null)}
          onGo={(l) => {
            engine.current?.goTo(l)
            setSheet(null)
            setChrome(false)
          }}
        />
      )}
      {sheet === 'search' && (
        <SearchSheet
          search={(q) => engine.current?.search(q) ?? Promise.resolve([])}
          onClose={() => setSheet(null)}
          onGo={(l) => {
            engine.current?.goTo(l)
            setSheet(null)
            setChrome(false)
          }}
        />
      )}
      {noteFor && <NoteSheet id={noteFor} onClose={() => setNoteFor(null)} />}

      {error && !relocated.current && (
        <div className="reader-error">
          <h2>Couldn’t open this book</h2>
          <p className="muted">
            {book.format.toUpperCase()} · {navigator.userAgent.match(/OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, '.') ?? 'unknown iOS'}
          </p>
          <pre className="reader-error-detail">{error}</pre>
          <button
            className="btn btn-secondary btn-block"
            onClick={() => {
              void navigator.clipboard?.writeText(`${book.format} | ${navigator.userAgent} | ${error}`)
              toast('Details copied')
            }}
          >
            Copy Details
          </button>
          <button className="btn btn-primary btn-block" onClick={() => navigate('/')}>
            Back to Library
          </button>
        </div>
      )}
    </div>
  )
}

function SelectionMenu({
  sel,
  onColor,
  onNote,
  onCopy,
  onShare,
}: {
  sel: Selection
  onColor: (c: HighlightColor) => void
  onNote: () => void
  onCopy: () => void
  onShare: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const frame = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth }
    const w = el.offsetWidth
    const h = el.offsetHeight
    const mid = (sel.rect.left + sel.rect.right) / 2 - frame.left
    const left = Math.min(Math.max(8, mid - w / 2), frame.width - w - 8)
    const above = sel.rect.top - frame.top - h - 12
    const top = above > 60 ? above : sel.rect.bottom - frame.top + 12
    setPos({ left, top })
  }, [sel])
  return (
    <div ref={ref} className="sel-menu" style={pos} onMouseDown={(e) => e.preventDefault()}>
      {HL_COLORS.map((c) => (
        <button key={c} className="sel-dot" style={{ background: HL_RGB[c] }} onClick={() => onColor(c)} aria-label={`Highlight ${c}`} />
      ))}
      <span className="sel-sep" />
      <button className="sel-btn" onClick={onNote}>
        Note
      </button>
      <button className="sel-btn" onClick={onCopy}>
        Copy
      </button>
      <button className="sel-btn" onClick={onShare}>
        Share
      </button>
    </div>
  )
}
