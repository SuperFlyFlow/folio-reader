import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, type Book } from '../lib/db'
import { ensureIndexed, searchText, type LibraryHit } from '../lib/fulltext'
import Icon from '../components/Icon'
import { Cover } from '../components/ui'

interface Group {
  book: Book
  hits: LibraryHit[]
}

export default function Search() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [status, setStatus] = useState('')
  const runId = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (params.get('q')) void run(params.get('q')!)
    else input.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(query: string) {
    const id = ++runId.current
    setParams({ q: query }, { replace: true })
    setGroups([])
    const books = (await db.books.toArray()).filter((b) => b.hasFile)
    const out: Group[] = []
    for (const [i, b] of books.entries()) {
      if (runId.current !== id) return
      if (!(await db.texts.get(b.id))) setStatus(`Indexing ${b.title} (${i + 1}/${books.length})…`)
      try {
        const entry = await ensureIndexed(b)
        const hits = entry ? searchText(entry, query) : []
        if (hits.length) {
          out.push({ book: b, hits })
          if (runId.current === id) setGroups([...out])
        }
      } catch (e) {
        console.warn('index failed', b.title, e)
      }
    }
    if (runId.current === id) setStatus('')
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

  const total = groups?.reduce((s, g) => s + g.hits.length, 0) ?? 0

  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      <div className="nav-row" style={{ justifyContent: 'flex-start' }}>
        <button className="nav-back" onClick={() => navigate(-1)}>
          <Icon name="back" size={22} stroke={2.4} /> Library
        </button>
      </div>
      <h1 className="large-title">Search</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (q.trim()) void run(q.trim())
          input.current?.blur()
        }}
      >
        <label className="search-field">
          <Icon name="search" size={17} stroke={2} />
          <input ref={input} type="search" enterKeyHint="search" placeholder="Search inside all books" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </form>

      {status && <p className="caption" style={{ margin: '4px var(--gutter)' }}>{status}</p>}
      {groups && !status && (
        <p className="caption" style={{ margin: '4px var(--gutter) 8px' }}>
          {total ? `${total} match${total === 1 ? '' : 'es'} in ${groups.length} book${groups.length === 1 ? '' : 's'}` : 'No matches'}
        </p>
      )}

      {groups?.map(({ book, hits }) => (
        <section key={book.id} className="search-group">
          <div className="search-group-head">
            <Cover book={book} width={34} />
            <div>
              <div className="strong">{book.title}</div>
              <div className="caption">
                {hits.length}
                {hits.length === 25 ? '+' : ''} matches
              </div>
            </div>
          </div>
          <div className="group" style={{ margin: '0 var(--gutter) 20px' }}>
            {hits.map((h, i) => (
              <button
                key={i}
                className="row no-icon search-hit"
                onClick={() =>
                  navigate(
                    book.format === 'pdf'
                      ? `/read/${book.id}?loc=${encodeURIComponent(h.href)}`
                      : `/read/${book.id}?find=${encodeURIComponent(q.trim())}&href=${encodeURIComponent(h.href)}&nth=${h.nth}`,
                  )
                }
              >
                <span className="row-label">
                  {h.label && <span className="caption" style={{ display: 'block' }}>{h.label}</span>}
                  <span className="search-excerpt">{mark(h.excerpt)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
