import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { CLASSICS, classicCover, type Classic } from '../lib/classics'
import Icon from './Icon'
import { Cover, Sheet, formatDuration, toast } from './ui'

function ClassicCover({ c, width }: { c: Classic; width?: number }) {
  if (c.plainCover) return <Cover book={{ id: `classic-${c.id}`, title: c.title, author: c.author }} width={width} />
  return <img className="cover" src={classicCover(c)} alt="" loading="lazy" draggable={false} style={{ width }} />
}

/** "Free Classics": curated public-domain books you can add with one tap. */
export default function ClassicsShelf() {
  const navigate = useNavigate()
  const [open, setOpen] = useState<Classic | null>(null)
  const [adding, setAdding] = useState(false)
  const owned = useLiveQuery(async () => {
    const titles = new Map((await db.books.toArray()).map((b) => [b.title.toLowerCase(), b.id]))
    return titles
  }, [])

  async function add(c: Classic) {
    setAdding(true)
    try {
      const { addClassic } = await import('../lib/importBook')
      const id = await addClassic(c)
      toast(`Added “${c.title}”`)
      setOpen(null)
      navigate(`/read/${id}`)
    } catch (e) {
      toast((e as Error).message || 'Couldn’t add that book')
    } finally {
      setAdding(false)
    }
  }

  const ownedId = (c: Classic) => owned?.get(c.title.toLowerCase())

  return (
    <>
      <div className="section-title">
        Free Classics
        <span className="caption">Public domain</span>
      </div>
      <div className="carousel classics">
        {CLASSICS.map((c) => (
          <button key={c.id} className="carousel-item classic-item" onClick={() => setOpen(c)}>
            <span className="classic-cover">
              <ClassicCover c={c} />
              {ownedId(c) && (
                <span className="cover-badge owned" aria-label="In your library">
                  <Icon name="check" size={13} stroke={3} />
                </span>
              )}
            </span>
            <span className="carousel-title">{c.title}</span>
            <span className="caption ellipsis">{c.author}</span>
          </button>
        ))}
      </div>

      {open && (
        <Sheet title="" onClose={() => setOpen(null)}>
          <div className="classic-detail">
            <ClassicCover c={open} width={104} />
            <h2>{open.title}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {open.author}
            </p>
            <p className="classic-tagline">{open.tagline}</p>
            <p className="classic-why">{open.why}</p>
            <p className="caption">About {formatDuration(open.minutes)} to read · Free, public domain</p>
            {ownedId(open) ? (
              <button className="btn btn-primary btn-block" onClick={() => navigate(`/read/${ownedId(open)}`)}>
                Read Now
              </button>
            ) : (
              <button className="btn btn-primary btn-block" onClick={() => add(open)} disabled={adding}>
                {adding ? 'Adding…' : 'Add to Library'}
              </button>
            )}
          </div>
        </Sheet>
      )}
    </>
  )
}
