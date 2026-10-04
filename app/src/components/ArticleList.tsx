import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Book, type Progress } from '../lib/db'
import { authorLine, sourceLine } from '../lib/articles'
import Icon from './Icon'
import { Cover } from './ui'

/** Library → Articles: a compact research list (first-page thumbnail, authors, journal, progress). */
export default function ArticleList({
  articles,
  progress,
  onImport,
  importing,
  query,
}: {
  articles: Book[]
  progress?: Map<string, Progress>
  onImport: () => void
  importing: boolean
  query: string
}) {
  const navigate = useNavigate()
  const highlightCounts = useLiveQuery(async () => {
    const counts = new Map<string, number>()
    const all = await db.annotations.filter((a) => a.type !== 'bookmark' && !a.deleted).toArray()
    for (const a of all) counts.set(a.bookId, (counts.get(a.bookId) ?? 0) + 1)
    return counts
  }, [])

  if (!articles.length && !query) {
    return (
      <div className="empty-state" style={{ paddingTop: 40 }}>
        <span className="empty-icon">
          <Icon name="doc" size={32} stroke={1.6} />
        </span>
        <h2>No articles yet</h2>
        <p>Import research papers and journal articles (PDF). Folio looks up the title, authors, journal and abstract from the paper’s DOI.</p>
        <button className="btn btn-primary" onClick={onImport} disabled={importing}>
          <Icon name="plus" size={18} stroke={2.4} />
          {importing ? 'Importing…' : 'Import Article'}
        </button>
      </div>
    )
  }

  return (
    <div className="article-list">
      {articles.map((a) => {
        const pct = Math.round((progress?.get(a.id)?.percent ?? 0) * 100)
        const hl = highlightCounts?.get(a.id) ?? 0
        const authors = authorLine(a.article?.authors) || a.author
        const source = sourceLine(a.article)
        return (
          <div key={a.id} className="article-row">
            <button className="article-thumb" onClick={() => navigate(`/read/${a.id}`)} aria-label={`Open ${a.title}`}>
              <Cover book={a} width={52} />
            </button>
            <button className="article-text" onClick={() => navigate(`/read/${a.id}`)}>
              <span className="article-title">{a.title}</span>
              {authors && <span className="article-authors">{authors}</span>}
              {source && <span className="article-source">{source}</span>}
              <span className="article-meta">
                {pct > 0 ? (
                  <>
                    <span className="progress-track" style={{ width: 56 }}>
                      <span className="progress-fill" style={{ width: `${pct}%`, display: 'block' }} />
                    </span>
                    <span>{pct >= 100 ? 'Read' : `${pct}%`}</span>
                  </>
                ) : (
                  <span className="new-badge">New</span>
                )}
                {hl > 0 && (
                  <span className="article-hl">
                    <Icon name="quote" size={12} stroke={2.2} /> {hl}
                  </span>
                )}
              </span>
            </button>
            <button className="tile-more" onClick={() => navigate(`/book/${a.id}`)} aria-label="Article details">
              <Icon name="more" size={20} stroke={2.6} />
            </button>
          </div>
        )
      })}
      {query && !articles.length && <p className="muted list-empty">No articles match “{query}”.</p>}
    </div>
  )
}
