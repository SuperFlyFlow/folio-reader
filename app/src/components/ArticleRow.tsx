import type { ReactNode } from 'react'
import Icon from './Icon'

/** Journal badge: initials on a soft tint derived from the journal name (stable per journal). */
export function JournalMark({ journal, size = 40 }: { journal?: string; size?: number }) {
  const name = journal?.trim() || 'Article'
  const words = name.split(/\s+/).filter((w) => !/^(of|in|the|and|for|on|&)$/i.test(w))
  const initials = (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [name[0]]).join('').toUpperCase()
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span className="journal-mark" style={{ width: size, height: size, ['--h' as string]: hue }} aria-hidden="true">
      {initials}
    </span>
  )
}

/** "Yeager, Hanselman, Walton et al." — surnames read cleaner in lists. */
export function surnames(authors?: string[], fallback?: string, max = 3) {
  const list = authors?.length ? authors : fallback ? fallback.split(/,\s*/) : []
  const names = list.filter(Boolean).map((n) => n.trim().split(/\s+/).pop() ?? n)
  if (!names.length) return ''
  return names.length > max ? `${names.slice(0, max).join(', ')} et al.` : names.join(', ')
}

export default function ArticleRow({
  journal,
  eyebrow,
  title,
  byline,
  status,
  trailing,
  onOpen,
  onMore,
}: {
  journal?: string
  eyebrow: string
  title: string
  byline?: string
  status?: ReactNode
  trailing?: ReactNode
  onOpen: () => void
  onMore?: () => void
}) {
  return (
    <div className="a-row">
      <button className="a-row-main" onClick={onOpen}>
        <JournalMark journal={journal} />
        <span className="a-row-text">
          <span className="a-eyebrow">{eyebrow}</span>
          <span className="a-title">{title}</span>
          {byline && <span className="a-byline">{byline}</span>}
          {status && <span className="a-status">{status}</span>}
        </span>
      </button>
      {trailing}
      {onMore && (
        <button className="a-more" onClick={onMore} aria-label="Details">
          <Icon name="more" size={18} stroke={2.6} />
        </button>
      )}
    </div>
  )
}
