import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import Icon from '../components/Icon'
import { Cover, formatDuration } from '../components/ui'

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Reading() {
  const navigate = useNavigate()
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const books = useLiveQuery(() => db.books.toArray(), [])
  const progress = useLiveQuery(async () => new Map((await db.progress.toArray()).map((p) => [p.bookId, p])), [])
  const highlightCount = useLiveQuery(() => db.annotations.filter((a) => a.type !== 'bookmark' && !a.deleted).count(), [])

  const stats = useMemo(() => {
    const perDay = new Map<string, number>()
    for (const s of sessions ?? []) perDay.set(s.day, (perDay.get(s.day) ?? 0) + s.seconds)

    const today = new Date()
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - 6 + i)
      return { label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), minutes: (perDay.get(dayKey(d)) ?? 0) / 60, isToday: i === 6 }
    })
    const weekMinutes = week.reduce((s, d) => s + d.minutes, 0)

    // Streak: consecutive days with ≥ 1 minute, counting back from today (or yesterday if today is empty).
    let streak = 0
    const cursor = new Date(today)
    if ((perDay.get(dayKey(cursor)) ?? 0) < 60) cursor.setDate(cursor.getDate() - 1)
    while ((perDay.get(dayKey(cursor)) ?? 0) >= 60) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }

    const monthPrefix = dayKey(today).slice(0, 7)
    const monthSeconds = [...perDay].filter(([d]) => d.startsWith(monthPrefix)).reduce((s, [, v]) => s + v, 0)
    return { week, weekMinutes, streak, monthHours: monthSeconds / 3600 }
  }, [sessions])

  const finished = books?.filter((b) => (progress?.get(b.id)?.percent ?? 0) >= 0.995).length ?? 0
  const current = (books ?? [])
    .filter((b) => {
      const p = progress?.get(b.id)?.percent ?? 0
      return p > 0.001 && p < 0.995
    })
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
  const maxMin = Math.max(10, ...stats.week.map((d) => d.minutes))

  return (
    <div className="screen">
      <div className="nav-row" />
      <h1 className="large-title">Reading</h1>

      <div className="card stat-chart">
        <div className="stat-chart-head">
          <span className="caption">This Week</span>
          <span className="stat-chart-total">{formatDuration(stats.weekMinutes)}</span>
        </div>
        <div className="bars">
          {stats.week.map((d, i) => (
            <div key={i} className="bar-col">
              <div className="bar-track">
                <div className={`bar${d.isToday ? ' today' : ''}`} style={{ height: `${Math.max(d.minutes > 0 ? 4 : 0, (d.minutes / maxMin) * 100)}%` }} />
              </div>
              <span className={`caption${d.isToday ? ' strong' : ''}`}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card streak-card">
        <span className="streak-icon">
          <Icon name="flame" size={22} stroke={1.8} fill />
        </span>
        <div>
          <div className="streak-title">{stats.streak ? `${stats.streak}-day streak` : 'Start a streak'}</div>
          <div className="caption">{stats.streak ? 'Read a little every day to keep it going.' : 'Read for a minute today to begin.'}</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <Icon name="books" size={20} className="accent" />
          <span className="stat-label caption">Books finished</span>
          <span className="stat-value">{finished}</span>
        </div>
        <div className="card stat">
          <Icon name="chart" size={20} className="accent" />
          <span className="stat-label caption">Hours this month</span>
          <span className="stat-value">{stats.monthHours < 10 ? stats.monthHours.toFixed(1) : Math.round(stats.monthHours)}</span>
        </div>
        <div className="card stat">
          <Icon name="quote" size={20} className="accent" />
          <span className="stat-label caption">Highlights</span>
          <span className="stat-value">{highlightCount ?? 0}</span>
        </div>
      </div>

      {current.length > 0 && <div className="section-title">Currently Reading</div>}
      {(['book', 'article'] as const).map((kind) => {
        const list = current.filter((b) => (b.kind ?? 'book') === kind)
        if (!list.length) return null
        return (
          <section key={kind}>
            <div className="reading-group">
              {kind === 'book' ? 'Books' : 'Articles'}
              <span className="caption">{list.length}</span>
            </div>
            <div className="carousel">
              {list.map((b) => {
                const p = Math.round((progress?.get(b.id)?.percent ?? 0) * 100)
                return (
                  <button key={b.id} className="carousel-item" onClick={() => navigate(`/read/${b.id}`)}>
                    <Cover book={b} width={104} />
                    <span className="carousel-title">{b.title}</span>
                    {kind === 'article' && b.article?.journal && <span className="caption ellipsis">{b.article.journal}</span>}
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${p}%` }} />
                    </div>
                    <span className="caption">{p}%</span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
