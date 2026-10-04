import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { PAPERS, type Paper } from '../lib/papers'
import { authorLine } from '../lib/articles'
import Icon from './Icon'
import { Sheet, formatDuration, toast } from './ui'

/** "Recommended Reading": curated open-access papers you can add to Articles with one tap. */
export default function PapersShelf() {
  const navigate = useNavigate()
  const [open, setOpen] = useState<Paper | null>(null)
  const [adding, setAdding] = useState(false)
  const owned = useLiveQuery(async () => new Map((await db.books.toArray()).map((b) => [b.title.toLowerCase(), b.id])), [])
  const ownedId = (p: Paper) => owned?.get(p.title.toLowerCase())

  async function add(p: Paper) {
    setAdding(true)
    try {
      const { addPaper } = await import('../lib/importBook')
      const id = await addPaper(p)
      toast('Added to Articles')
      setOpen(null)
      navigate(`/read/${id}`)
    } catch (e) {
      toast((e as Error).message || 'Couldn’t add that paper')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <div className="section-title">
        Recommended Reading
        <span className="caption">Open access</span>
      </div>
      <div className="paper-cards">
        {PAPERS.map((p) => (
          <button key={p.file} className="paper-card" onClick={() => setOpen(p)}>
            <span className="paper-topic">
              {p.topic}
              {ownedId(p) && <Icon name="check" size={13} stroke={3} className="paper-owned" />}
            </span>
            <span className="paper-title">{p.title}</span>
            <span className="paper-meta">
              {p.journal} · {p.year}
            </span>
          </button>
        ))}
      </div>

      {open && (
        <Sheet title="" onClose={() => setOpen(null)}>
          <div className="paper-detail">
            <span className="paper-topic">{open.topic}</span>
            <h2>{open.title}</h2>
            <p className="muted">{authorLine(open.authors, 4)}</p>
            <p className="paper-source">
              {open.journal} · {open.year}
            </p>
            <p className="classic-why">{open.why}</p>
            <p className="caption">
              About {formatDuration(open.minutes)} to read · Open access, CC BY · doi.org/{open.doi}
            </p>
            {ownedId(open) ? (
              <button className="btn btn-primary btn-block" onClick={() => navigate(`/read/${ownedId(open)}`)}>
                Read Now
              </button>
            ) : (
              <button className="btn btn-primary btn-block" onClick={() => add(open)} disabled={adding}>
                {adding ? 'Adding…' : 'Add to Articles'}
              </button>
            )}
          </div>
        </Sheet>
      )}
    </>
  )
}
