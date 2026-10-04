import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Book, type Progress } from '../lib/db'
import Icon from '../components/Icon'
import { Cover, Sheet, toast } from '../components/ui'
import ClassicsShelf from '../components/ClassicsShelf'
import ArticleList from '../components/ArticleList'
import PapersShelf from '../components/PapersShelf'
import { Segmented } from '../components/ui'

type SortKey = 'recent' | 'title' | 'author' | 'added'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently Read' },
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'added', label: 'Date Added' },
]

function sortBooks(books: Book[], key: SortKey) {
  const s = [...books]
  if (key === 'title') s.sort((a, b) => a.title.localeCompare(b.title))
  else if (key === 'author') s.sort((a, b) => (a.author || '~').localeCompare(b.author || '~'))
  else if (key === 'added') s.sort((a, b) => b.addedAt - a.addedAt)
  else s.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt))
  return s
}

export default function Library() {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>(() => {
    try {
      return (localStorage.getItem('folio.sort') as SortKey) || 'recent'
    } catch {
      return 'recent'
    }
  })
  const [sortOpen, setSortOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [shelf, setShelfState] = useState<'books' | 'articles'>(() => {
    try {
      return localStorage.getItem('folio.shelf') === 'articles' ? 'articles' : 'books'
    } catch {
      return 'books'
    }
  })
  const setShelf = (v: 'books' | 'articles') => {
    setShelfState(v)
    setQuery('')
    try {
      localStorage.setItem('folio.shelf', v)
    } catch {
      /* ignore */
    }
  }

  const everything = useLiveQuery(() => db.books.toArray(), [])
  const books = useMemo(() => everything?.filter((b) => b.kind !== 'article'), [everything])
  const articles = useMemo(() => everything?.filter((b) => b.kind === 'article'), [everything])
  const progress = useLiveQuery(async () => {
    const all = await db.progress.toArray()
    return new Map(all.map((p) => [p.bookId, p]))
  }, [])

  const continueBook = useMemo(() => {
    if (!books || !progress) return undefined
    return books
      .filter((b) => b.kind !== 'article' && b.lastOpenedAt && (progress.get(b.id)?.percent ?? 0) < 0.995)
      .sort((a, b) => b.lastOpenedAt! - a.lastOpenedAt!)[0]
  }, [books, progress])

  const visible = useMemo(() => {
    if (!books) return []
    const q = query.trim().toLowerCase()
    const filtered = q ? books.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(q)) : books
    return sortBooks(filtered, sort)
  }, [books, query, sort])

  const visibleArticles = useMemo(() => {
    if (!articles) return []
    const q = query.trim().toLowerCase()
    const filtered = q
      ? articles.filter((b) =>
          [b.title, b.author, b.article?.journal, b.article?.year, b.article?.doi, ...(b.article?.authors ?? [])]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : articles
    return sortBooks(filtered, sort)
  }, [articles, query, sort])

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setImporting(true)
    try {
      const { importFiles } = await import('../lib/importBook')
      if (shelf === 'articles') toast('Looking up paper details…')
      const { added, skipped } = await importFiles(files, undefined, { kind: shelf === 'articles' ? 'article' : 'book' })
      const noun = shelf === 'articles' ? 'articles' : 'books'
      if (added.length) toast(added.length === 1 ? `Added “${added[0].title}”` : `Added ${added.length} ${noun}`)
      if (skipped.length) toast(`Skipped ${skipped.length} unsupported file${skipped.length > 1 ? 's' : ''}`)
    } catch (e) {
      toast('Could not import that file')
      console.error(e)
    } finally {
      setImporting(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const pickFiles = () => fileInput.current?.click()

  return (
    <div className="screen">
      <input ref={fileInput} type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" multiple hidden onChange={(e) => onFiles(e.target.files)} />

      <div className="nav-row">
        {!!everything?.length && (
          <button className="icon-btn filled" onClick={() => navigate('/search')} aria-label="Search inside books">
            <Icon name="search" size={18} stroke={2.2} />
          </button>
        )}
        {!!everything?.length && (
          <button className="icon-btn filled" onClick={() => setSortOpen(true)} aria-label="Sort">
            <Icon name="sort" size={18} stroke={2} />
          </button>
        )}
        <button className="icon-btn filled" onClick={pickFiles} aria-label={shelf === 'articles' ? 'Import articles' : 'Import books'} disabled={importing}>
          <Icon name="plus" size={18} stroke={2.4} />
        </button>
      </div>
      <h1 className="large-title">Library</h1>
      <div className="shelf-switch">
        <Segmented
          value={shelf}
          options={[
            { value: 'books', label: `Books${books?.length ? ` · ${books.length}` : ''}` },
            { value: 'articles', label: `Articles${articles?.length ? ` · ${articles.length}` : ''}` },
          ]}
          onChange={setShelf}
        />
      </div>

      {shelf === 'articles' && articles && (
        <>
          {articles.length > 0 && (
            <label className="search-field">
              <Icon name="search" size={17} stroke={2} />
              <input
                type="search"
                placeholder="Search titles, authors, journals"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          )}
          <ArticleList articles={visibleArticles} progress={progress} onImport={pickFiles} importing={importing} query={query} />
          {!query && <PapersShelf />}
        </>
      )}

      {shelf === 'books' && books && books.length === 0 && (
        <div className="empty-state">
          <EmptyIllustration />
          <h2>Your library is empty</h2>
          <p>Import PDFs and EPUBs from Files, iCloud Drive or Downloads.</p>
          <button className="btn btn-primary" onClick={pickFiles} disabled={importing}>
            <Icon name="plus" size={18} stroke={2.4} />
            {importing ? 'Importing…' : 'Import Books'}
          </button>
          <p className="caption" style={{ marginTop: 14 }}>
            Supported: PDF, EPUB
          </p>
        </div>
      )}
      {shelf === 'books' && books && books.length === 0 && (
        <div style={{ marginTop: 32 }}>
          <ClassicsShelf />
        </div>
      )}

      {shelf === 'books' && !!books?.length && (
        <>
          <label className="search-field">
            <Icon name="search" size={17} stroke={2} />
            <input
              type="search"
              placeholder="Search books, authors"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          {continueBook && !query && (
            <>
              <div className="section-title">Continue Reading</div>
              <ContinueCard book={continueBook} progress={progress?.get(continueBook.id)} />
            </>
          )}

          <div className="section-title">
            {query ? 'Results' : 'All Books'}
            <span className="caption">{visible.length}</span>
          </div>
          <div className="book-grid">
            {visible.map((b) => (
              <BookTile key={b.id} book={b} percent={progress?.get(b.id)?.percent ?? 0} />
            ))}
          </div>
          {query && visible.length === 0 && (
            <p className="muted" style={{ textAlign: 'center', marginTop: 32 }}>
              No books match “{query}”.{' '}
              <button className="link-btn" onClick={() => navigate(`/search?q=${encodeURIComponent(query)}`)}>
                Search inside books
              </button>
            </p>
          )}
        </>
      )}

      {shelf === 'books' && !!books?.length && !query && <ClassicsShelf />}

      {importing && <div className="toast">Importing…</div>}

      {sortOpen && (
        <Sheet title="Sort By" onClose={() => setSortOpen(false)}>
          <div className="group" style={{ margin: '0 0 8px' }}>
            {SORTS.map((s) => (
              <button
                key={s.key}
                className="row no-icon"
                onClick={() => {
                  setSort(s.key)
                  try {
                    localStorage.setItem('folio.sort', s.key)
                  } catch {
                    /* ignore */
                  }
                  setSortOpen(false)
                }}
              >
                <span className="row-label">{s.label}</span>
                {sort === s.key && <Icon name="check" size={18} stroke={2.4} className="accent" />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}

function ContinueCard({ book, progress }: { book: Book; progress?: Progress }) {
  const navigate = useNavigate()
  const pct = Math.round((progress?.percent ?? 0) * 100)
  return (
    <button className="continue-card" onClick={() => navigate(`/read/${book.id}`)}>
      <Cover book={book} width={76} />
      <div className="continue-meta">
        <div className="continue-title">{book.title}</div>
        {book.author && <div className="muted continue-author">{book.author}</div>}
        {progress?.chapter && <div className="caption continue-chapter">{progress.chapter}</div>}
        <div className="continue-progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="caption">{pct}%</span>
        </div>
      </div>
    </button>
  )
}

function BookTile({ book, percent }: { book: Book; percent: number }) {
  const navigate = useNavigate()
  const pct = Math.round(percent * 100)
  return (
    <div className="book-tile">
      <button className="book-tile-cover" onClick={() => navigate(`/read/${book.id}`)} aria-label={`Open ${book.title}`}>
        <Cover book={book} />
        {!book.hasFile && (
          <span className="cover-badge" title="In your cloud backup — opens after downloading">
            <Icon name="cloud" size={14} stroke={2} />
          </span>
        )}
      </button>
      <div className="book-tile-meta">
        <div className="book-tile-text" onClick={() => navigate(`/book/${book.id}`)}>
          <div className="book-tile-title">{book.title}</div>
          <div className="book-tile-author">{book.author || (book.format === 'pdf' ? 'PDF' : 'EPUB')}</div>
        </div>
        <button className="tile-more" onClick={() => navigate(`/book/${book.id}`)} aria-label="Book details">
          <Icon name="more" size={20} stroke={2.6} />
        </button>
      </div>
      <div className="book-tile-progress">
        {pct > 0 ? (
          <>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="caption">{pct >= 100 ? 'Done' : `${pct}%`}</span>
          </>
        ) : (
          <span className="caption new-badge">New</span>
        )}
      </div>
    </div>
  )
}

function EmptyIllustration() {
  return (
    <svg width="132" height="96" viewBox="0 0 132 96" fill="none" stroke="currentColor" strokeWidth="1.6" className="illustration" aria-hidden="true">
      <path d="M66 22c-12-8-30-10-50-8v66c20-2 38 0 50 8 12-8 30-10 50-8V14c-20-2-38 0-50 8z" />
      <path d="M66 22v66" />
      <path d="M26 30c10-1 20 0 30 4M26 42c10-1 20 0 30 4M26 54c10-1 20 0 30 4M76 34c10-4 20-5 30-4M76 46c10-4 20-5 30-4M76 58c10-4 20-5 30-4" opacity=".45" />
      <circle cx="112" cy="10" r="2" fill="currentColor" stroke="none" opacity=".5" />
      <circle cx="20" cy="4" r="1.5" fill="currentColor" stroke="none" opacity=".35" />
    </svg>
  )
}
