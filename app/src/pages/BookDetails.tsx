import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { deleteBookEverywhere, MAX_BACKUP_BYTES } from '../lib/sync'
import { highlightsMarkdown, shareMarkdown } from '../lib/export'
import { getSettings } from '../lib/settings'
import { authorLine, citation, lookupArticle, sourceLine } from '../lib/articles'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import { Cover, Sheet, formatBytes, formatDuration, toast, useBack } from '../components/ui'

export default function BookDetails() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const goBack = useBack()
  const book = useLiveQuery(() => db.books.get(id), [id])
  const progress = useLiveQuery(() => db.progress.get(id), [id])
  const counts = useLiveQuery(async () => {
    const all = await db.annotations.where('bookId').equals(id).filter((a) => !a.deleted).toArray()
    return { bookmarks: all.filter((a) => a.type === 'bookmark').length, highlights: all.filter((a) => a.type !== 'bookmark').length }
  }, [id])
  const seconds = useLiveQuery(async () => (await db.sessions.where('bookId').equals(id).toArray()).reduce((s, x) => s + x.seconds, 0), [id])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [abstractOpen, setAbstractOpen] = useState(false)
  const [doiOpen, setDoiOpen] = useState(false)
  const [doiInput, setDoiInput] = useState('')
  const [looking, setLooking] = useState(false)

  /** Push edited details (title, authors, journal…) to the backup without re-uploading the file. */
  async function saveMeta() {
    const b = await db.books.get(id)
    if (!b?.backedUp) return
    await supabase
      .from('books')
      .update({ title: b.title, author: b.author || null, kind: b.kind ?? 'book', meta: b.article ?? {} })
      .eq('id', b.id)
  }

  if (book === undefined) return <div className="screen" />
  if (!book) return <Navigate to="/" replace />

  const isArticle = book.kind === 'article'
  const pct = progress?.percent ?? 0
  const started = pct > 0.001
  // Estimate time left from time spent so far, else from page count.
  let minutesLeft: number | undefined
  if (seconds && pct > 0.02) minutesLeft = ((seconds / pct) * (1 - pct)) / 60
  else if (book.totalPages) minutesLeft = book.totalPages * (1 - pct) * 1.2

  const r = 26
  const circ = 2 * Math.PI * r

  return (
    <div className="screen detail-screen" style={{ paddingBottom: 40 }}>
      <div className="nav-row" style={{ justifyContent: 'space-between' }}>
        <button className="nav-back" onClick={goBack}>
          <Icon name="back" size={22} stroke={2.4} /> Library
        </button>
      </div>

      <div className="detail-hero">
        <div className="detail-cover">
          <Cover book={book} width={168} />
        </div>
        <h1 className="detail-title">{book.title}</h1>
        {isArticle ? (
          <>
            {(book.article?.authors?.length || book.author) && (
              <p className="muted detail-author">{authorLine(book.article?.authors, 6) || book.author}</p>
            )}
            {sourceLine(book.article) && <p className="detail-source">{sourceLine(book.article)}</p>}
          </>
        ) : (
          book.author && <p className="muted detail-author">{book.author}</p>
        )}

        <div className="detail-progress">
          <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
            <circle cx="30" cy="30" r={r} fill="none" stroke="var(--fill-strong)" strokeWidth="5" />
            <circle
              cx="30"
              cy="30"
              r={r}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
              transform="rotate(-90 30 30)"
            />
          </svg>
          <div>
            <div className="detail-pct">{Math.round(pct * 100)}% read</div>
            <div className="caption">
              {pct >= 0.995 ? 'Finished' : minutesLeft !== undefined ? `About ${formatDuration(minutesLeft)} left` : 'Not started'}
              {seconds ? ` · ${formatDuration(seconds / 60)} spent` : ''}
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-block" onClick={() => navigate(`/read/${id}`)}>
          {started ? 'Continue Reading' : 'Start Reading'}
        </button>
      </div>

      <div className="group">
        <button className="row" onClick={() => navigate(`/notes?book=${id}`)}>
          <span className="row-icon" style={{ background: '#ff9f0a' }}>
            <Icon name="quote" size={16} stroke={2} />
          </span>
          <span className="row-label">Highlights &amp; Notes</span>
          <span className="row-value">{counts?.highlights ?? 0}</span>
          <Icon name="chevron" size={16} stroke={2.4} className="row-chevron" />
        </button>
        <button className="row" onClick={() => navigate(`/notes?book=${id}&type=bookmark`)}>
          <span className="row-icon" style={{ background: '#ff3b30' }}>
            <Icon name="bookmark" size={16} stroke={2} />
          </span>
          <span className="row-label">Bookmarks</span>
          <span className="row-value">{counts?.bookmarks ?? 0}</span>
          <Icon name="chevron" size={16} stroke={2.4} className="row-chevron" />
        </button>
        <div className="row static">
          <span className="row-icon" style={{ background: '#5352ed' }}>
            <Icon name="doc" size={16} stroke={2} />
          </span>
          <span className="row-label">Sync to Notion</span>
          <span className="row-value">{getSettings().notionAutoSync ? 'Automatic' : 'Off'}</span>
        </div>
        <button
          className="row"
          onClick={async () => {
            if (!counts?.highlights) return toast('No highlights yet')
            await shareMarkdown(await highlightsMarkdown(id), `${book.title} — Highlights`)
          }}
        >
          <span className="row-icon" style={{ background: '#34c759' }}>
            <Icon name="share" size={16} stroke={2} />
          </span>
          <span className="row-label">Export Highlights</span>
          <Icon name="chevron" size={16} stroke={2.4} className="row-chevron" />
        </button>
      </div>

      {isArticle && book.article?.abstract && (
        <div className={`abstract${abstractOpen ? '' : ' clamped'}`} onClick={() => setAbstractOpen((o) => !o)}>
          <h3>Abstract</h3>
          <p>{book.article.abstract}</p>
        </div>
      )}

      {isArticle && (
        <div className="group">
          <button
            className="row"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(citation(book))
                toast('Citation copied')
              } catch {
                toast(citation(book))
              }
            }}
          >
            <span className="row-icon" style={{ background: '#5352ed' }}>
              <Icon name="copy" size={16} stroke={2} />
            </span>
            <span className="row-label">Copy Citation</span>
            <span className="row-value caption">APA</span>
          </button>
          {book.article?.doi ? (
            <a className="row" href={`https://doi.org/${book.article.doi}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="row-icon" style={{ background: '#0a84ff' }}>
                <Icon name="share" size={16} stroke={2} />
              </span>
              <span className="row-label">
                Open Publisher Page
                <span className="caption" style={{ display: 'block' }}>
                  doi.org/{book.article.doi}
                </span>
              </span>
              <Icon name="chevron" size={16} stroke={2.4} className="row-chevron" />
            </a>
          ) : (
            <button className="row" onClick={() => setDoiOpen(true)}>
              <span className="row-icon" style={{ background: '#ff9f0a' }}>
                <Icon name="search" size={16} stroke={2} />
              </span>
              <span className="row-label">
                Find Paper Details
                <span className="caption" style={{ display: 'block' }}>
                  Enter the DOI to fill in authors, journal and abstract
                </span>
              </span>
              <Icon name="chevron" size={16} stroke={2.4} className="row-chevron" />
            </button>
          )}
        </div>
      )}

      <div className="group-header">Info</div>
      <div className="group">
        <div className="row no-icon static">
          <span className="row-label">Format</span>
          <span className="row-value">{book.format.toUpperCase()}</span>
        </div>
        {book.totalPages && (
          <div className="row no-icon static">
            <span className="row-label">Pages</span>
            <span className="row-value">{book.totalPages}</span>
          </div>
        )}
        <div className="row no-icon static">
          <span className="row-label">Size</span>
          <span className="row-value">{formatBytes(book.sizeBytes)}</span>
        </div>
        <div className="row no-icon static">
          <span className="row-label">Cloud Backup</span>
          <span className="row-value">
            {book.backedUp ? 'Backed up' : book.sizeBytes > MAX_BACKUP_BYTES ? 'Too large (50 MB max)' : 'Pending'}
          </span>
        </div>
        <div className="row no-icon static">
          <span className="row-label">Added</span>
          <span className="row-value">{new Date(book.addedAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="group">
        <button
          className="row no-icon"
          onClick={async () => {
            await db.books.update(id, isArticle ? { kind: 'book' } : { kind: 'article', article: book.article ?? {} })
            await saveMeta()
            toast(isArticle ? 'Moved to Books' : 'Moved to Articles')
          }}
        >
          <span className="row-label accent">{isArticle ? 'Move to Books' : 'Move to Articles'}</span>
        </button>
        <button className="row no-icon destructive" onClick={() => setConfirmDelete(true)}>
          <span className="row-label">Remove from Library</span>
        </button>
      </div>

      {doiOpen && (
        <Sheet title="Find Paper Details" onClose={() => setDoiOpen(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Paste the paper’s DOI (e.g. 10.1038/nature14539) or arXiv id (e.g. arXiv:1706.03762). It’s usually on the first page.
          </p>
          <label className="search-field" style={{ margin: '0 0 14px' }}>
            <input value={doiInput} onChange={(e) => setDoiInput(e.target.value)} placeholder="10.xxxx/… or arXiv:…" autoFocus />
          </label>
          <button
            className="btn btn-primary btn-block"
            disabled={looking || !doiInput.trim()}
            onClick={async () => {
              setLooking(true)
              const raw = doiInput.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
              const arxiv = raw.match(/(?:arxiv:)?\s*(\d{4}\.\d{4,5})/i)?.[1]
              const idv = arxiv && !raw.startsWith('10.') ? `10.48550/arXiv.${arxiv}` : raw
              const found = await lookupArticle(idv)
              setLooking(false)
              if (!found) return toast('No details found for that DOI')
              const { title, ...article } = found
              await db.books.update(id, {
                article,
                ...(title ? { title } : {}),
                ...(article.authors?.length ? { author: article.authors.join(', ') } : {}),
              })
              await saveMeta()
              setDoiOpen(false)
              toast('Details updated')
            }}
          >
            {looking ? 'Looking up…' : 'Look Up'}
          </button>
        </Sheet>
      )}

      {confirmDelete && (
        <Sheet title="Remove this book?" onClose={() => setConfirmDelete(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            “{book.title}” and its highlights will be removed from this device and your cloud backup. Highlights already in Notion stay there.
          </p>
          <button
            className="btn btn-block"
            style={{ background: 'var(--danger)', color: '#fff', marginBottom: 10 }}
            onClick={async () => {
              await deleteBookEverywhere(book)
              toast('Book removed')
              navigate('/', { replace: true })
            }}
          >
            Remove Book
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </Sheet>
      )}
    </div>
  )
}
