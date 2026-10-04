import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { PAPERS, type Paper } from '../lib/papers'
import Icon from './Icon'
import ArticleRow, { JournalMark, surnames } from './ArticleRow'
import { Sheet, formatDuration, toast } from './ui'

/** "Recommended Reading": curated open-access papers, added to Articles with one tap. */
export default function PapersShelf() {
  const navigate = useNavigate()
  const [open, setOpen] = useState<Paper | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const owned = useLiveQuery(async () => new Map((await db.books.toArray()).map((b) => [b.title.toLowerCase(), b.id])), [])
  const ownedId = (p: Paper) => owned?.get(p.title.toLowerCase())

  async function add(p: Paper, openAfter = true) {
    setAdding(p.file)
    try {
      const { addPaper } = await import('../lib/importBook')
      const id = await addPaper(p)
      toast('Added to Articles')
      setOpen(null)
      if (openAfter) navigate(`/read/${id}`)
    } catch (e) {
      toast((e as Error).message || 'Couldn’t add that paper')
    } finally {
      setAdding(null)
    }
  }

  return (
    <>
      <div className="section-title small">
        Recommended Reading
        <span className="caption">Open access</span>
      </div>
      <div className="a-list">
        {PAPERS.map((p) => {
          const id = ownedId(p)
          return (
            <ArticleRow
              key={p.file}
              journal={p.journal}
              eyebrow={`${p.topic} · ${p.year}`}
              title={p.title}
              byline={surnames(p.authors)}
              status={<span>{p.journal}</span>}
              onOpen={() => setOpen(p)}
              trailing={
                id ? (
                  <button className="a-pill done" onClick={() => navigate(`/read/${id}`)} aria-label={`Read ${p.title}`}>
                    <Icon name="check" size={13} stroke={3} /> Read
                  </button>
                ) : (
                  <button className="a-pill" onClick={() => add(p, false)} disabled={adding === p.file} aria-label={`Add ${p.title}`}>
                    {adding === p.file ? '…' : 'Add'}
                  </button>
                )
              }
            />
          )
        })}
      </div>

      {open && (
        <Sheet title="" onClose={() => setOpen(null)}>
          <div className="paper-detail">
            <div className="paper-detail-head">
              <JournalMark journal={open.journal} size={44} />
              <div>
                <div className="a-eyebrow">{open.topic}</div>
                <div className="paper-detail-journal">
                  {open.journal} · {open.year}
                </div>
              </div>
            </div>
            <h2>{open.title}</h2>
            <p className="paper-detail-authors">{open.authors.join(', ')}</p>
            <p className="paper-detail-why">{open.why}</p>
            <p className="caption">
              About {formatDuration(open.minutes)} · Open access (CC BY) · doi.org/{open.doi}
            </p>
            {ownedId(open) ? (
              <button className="btn btn-primary btn-block" onClick={() => navigate(`/read/${ownedId(open)}`)}>
                Read Now
              </button>
            ) : (
              <button className="btn btn-primary btn-block" onClick={() => add(open)} disabled={!!adding}>
                {adding ? 'Adding…' : 'Add to Articles'}
              </button>
            )}
          </div>
        </Sheet>
      )}
    </>
  )
}
