import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import type { Book } from '../lib/db'
import Icon from './Icon'

/**
 * Back that always lands somewhere: the previous screen if there is one in this session,
 * otherwise the fallback. (Installed web apps have no browser back button, and a book opened
 * right after launch or an update has no history to go back to.)
 */
export function useBack(fallback = '/') {
  const navigate = useNavigate()
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }
}

export function TabBar() {
  const tabs = [
    { to: '/', icon: 'books', label: 'Library' },
    { to: '/reading', icon: 'hourglass', label: 'Reading' },
    { to: '/notes', icon: 'quill', label: 'Notes' },
    { to: '/settings', icon: 'gear', label: 'Settings' },
  ]
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          <Icon name={t.icon} size={25} stroke={1.7} />
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

/** Renders a book cover, or a typographic fallback when the file has none. */
export function Cover({
  book,
  width,
}: {
  book: Pick<Book, 'title' | 'author' | 'id' | 'coverBytes' | 'coverType'>
  width?: number
}) {
  const blob = useMemo(
    () => (book.coverBytes?.byteLength ? new Blob([book.coverBytes], { type: book.coverType || 'image/jpeg' }) : undefined),
    [book.coverBytes, book.coverType],
  )
  const url = useObjectUrl(blob)
  const [failed, setFailed] = useState(false)
  if (url && !failed)
    return <img className="cover" src={url} alt="" style={{ width }} draggable={false} onError={() => setFailed(true)} />
  const hue = [...book.id].reduce((h, c) => h + c.charCodeAt(0), 0) % 360
  return (
    <div
      className="cover cover-fallback"
      style={{ width, background: `linear-gradient(160deg, hsl(${hue} 32% 34%), hsl(${(hue + 30) % 360} 38% 20%))` }}
    >
      {/* With a fixed width, size text directly (container units misresolve in some layouts). */}
      <span className="cover-fallback-title" style={width ? { fontSize: width * 0.11 } : undefined}>
        {book.title}
      </span>
      {book.author && (
        <span className="cover-fallback-author" style={width ? { fontSize: width * 0.065 } : undefined}>
          {book.author}
        </span>
      )}
    </div>
  )
}

export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return setUrl(undefined)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function Sheet({
  title,
  onClose,
  children,
  right,
}: {
  title?: string
  onClose: () => void
  children: ReactNode
  right?: ReactNode
}) {
  // Portal to the app frame: inside a scrolled screen, an absolutely positioned sheet would sit
  // wherever the top of the scroll content is, not at the bottom of what's visible.
  const host = document.querySelector('.app-frame') ?? document.body
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-grabber" />
        {title !== undefined && (
          <div className="sheet-header">
            <h2>{title}</h2>
            {right ?? (
              <button className="close-btn" onClick={onClose} aria-label="Close">
                <Icon name="close" size={14} stroke={2.6} />
              </button>
            )}
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    host,
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

let toastSetter: ((m: string | null) => void) | null = null
export function toast(message: string) {
  toastSetter?.(message)
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    toastSetter = setMsg
    return () => {
      toastSetter = null
    }
  }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2400)
    return () => clearTimeout(t)
  }, [msg])
  return msg ? <div className="toast">{msg}</div> : null
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatDuration(minutes: number) {
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}
