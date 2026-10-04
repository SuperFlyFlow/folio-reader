import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Book, type Progress } from '../lib/db'
import Icon from './Icon'
import ArticleRow, { surnames } from './ArticleRow'
import { formatDuration } from './ui'

/** Library → Articles: a compact, typographic research list. */
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
      <div className="a-empty">
        <span className="a-empty-icon">
          <Icon name="doc" size={22} stroke={1.8} />
        </span>
        <div>
          <div className="a-empty-title">No articles yet</div>
          <div className="a-empty-text">Import a paper (PDF) and Folio fills in the title, authors and journal from its DOI.</div>
        </div>
        <button className="a-pill" onClick={onImport} disabled={importing}>
          {importing ? 'Adding…' : 'Import'}
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="section-title small">Your Articles</div>
      <div className="a-list">
        {articles.map((a) => {
          const pct = Math.round((progress?.get(a.id)?.percent ?? 0) * 100)
          const hl = highlightCounts?.get(a.id) ?? 0
          const journal = a.article?.journal
          const eyebrow = [journal, a.article?.year].filter(Boolean).join(' · ') || (a.format === 'pdf' ? 'PDF' : 'EPUB')
          const pages = a.totalPages
          return (
            <ArticleRow
              key={a.id}
              journal={journal}
              eyebrow={eyebrow}
              title={a.title}
              byline={surnames(a.article?.authors, a.author)}
              onOpen={() => navigate(`/read/${a.id}`)}
              onMore={() => navigate(`/book/${a.id}`)}
              status={
                <>
                  {pct > 0 ? (
                    <>
                      <span className="a-bar">
                        <span style={{ width: `${pct}%` }} />
                      </span>
                      <span>{pct >= 100 ? 'Finished' : `${pct}%`}</span>
                    </>
                  ) : (
                    <span>{pages ? `${pages} pages · ${formatDuration(pages * 2.5)}` : 'Not started'}</span>
                  )}
                  {hl > 0 && (
                    <span className="a-hl">
                      <Icon name="quote" size={11} stroke={2.4} />
                      {hl}
                    </span>
                  )}
                </>
              }
            />
          )
        })}
      </div>
      {query && !articles.length && <p className="muted list-empty">No articles match “{query}”.</p>}
    </>
  )
}
