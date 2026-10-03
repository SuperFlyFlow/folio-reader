import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { notionStatus, syncAll, syncNotion, type NotionStatus } from '../lib/sync'
import { highlightsMarkdown, shareMarkdown } from '../lib/export'
import { FONT_STACKS, setSettings, useSettings, type ReaderFont, type ThemeChoice } from '../lib/settings'
import Icon from '../components/Icon'
import { Sheet, Switch, formatBytes, toast } from '../components/ui'

const THEME_LABEL: Record<ThemeChoice, string> = { auto: 'Automatic', light: 'Light', sepia: 'Sepia', dark: 'Dark', black: 'True Black' }

type Picker = 'theme' | 'font' | null

export default function Settings({ session, onSignIn }: { session: Session | null; onSignIn: () => void }) {
  const s = useSettings()
  const [picker, setPicker] = useState<Picker>(null)
  const [syncing, setSyncing] = useState(false)
  const [usage, setUsage] = useState<number | null>(null)
  const library = useLiveQuery(async () => {
    const books = await db.books.toArray()
    return {
      count: books.length,
      backedUp: books.filter((b) => b.backedUp).length,
      bytes: books.filter((b) => b.backedUp).reduce((n, b) => n + b.sizeBytes, 0),
    }
  }, [])
  const unsynced = useLiveQuery(() => db.annotations.where('dirty').equals(1).count(), [])

  const [notion, setNotion] = useState<NotionStatus | null>(() => notionStatus())

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null)).catch(() => {})
    if (session) void syncNotion().then(setNotion)
  }, [session])

  async function syncNow() {
    setSyncing(true)
    await syncAll()
    setNotion(await syncNotion())
    setSyncing(false)
    toast('Up to date')
  }

  return (
    <div className="screen">
      <div className="nav-row" />
      <h1 className="large-title">Settings</h1>

      {session ? (
        <div className="group account-card">
          <div className="row static">
            <span className="avatar">{session.user.email?.[0]?.toUpperCase()}</span>
            <span className="row-label">
              <span className="strong">{session.user.email}</span>
              <span className="caption" style={{ display: 'block' }}>
                {library ? `${library.backedUp} of ${library.count} books backed up` : ' '}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <div className="group">
          <button className="row" onClick={onSignIn}>
            <span className="row-icon" style={{ background: '#5352ed' }}>
              <Icon name="cloud" size={17} stroke={2} />
            </span>
            <span className="row-label">
              Sign in to back up your library
              <span className="caption" style={{ display: 'block' }}>
                Back up books, progress and highlights, and sync to Notion
              </span>
            </span>
            <Icon name="chevron" size={16} stroke={2.4} className="row-chevron" />
          </button>
        </div>
      )}

      <div className="group-header">Appearance</div>
      <div className="group">
        <button className="row" onClick={() => setPicker('theme')}>
          <span className="row-icon" style={{ background: '#5e5ce6' }}>
            <Icon name="moon" size={16} stroke={2} />
          </span>
          <span className="row-label">Theme</span>
          <span className="row-value">{THEME_LABEL[s.theme]}</span>
          <Icon name="chevron" size={16} stroke={2.4} className="row-chevron" />
        </button>
        <button className="row" onClick={() => setPicker('font')}>
          <span className="row-icon" style={{ background: '#ff9f0a' }}>
            <Icon name="textformat" size={17} stroke={2} />
          </span>
          <span className="row-label">Reading Font</span>
          <span className="row-value">{FONT_STACKS[s.font].label}</span>
          <Icon name="chevron" size={16} stroke={2.4} className="row-chevron" />
        </button>
        <div className="row static">
          <span className="row-icon" style={{ background: '#8e8e93' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Aa</span>
          </span>
          <span className="row-label">Text Size</span>
          <div className="mini-stepper">
            <button onClick={() => setSettings({ fontSize: Math.max(70, s.fontSize - 10) })} aria-label="Smaller">
              −
            </button>
            <span>{s.fontSize}%</span>
            <button onClick={() => setSettings({ fontSize: Math.min(220, s.fontSize + 10) })} aria-label="Larger">
              +
            </button>
          </div>
        </div>
      </div>

      <div className="group-header">Reading</div>
      <div className="group">
        <div className="row static">
          <span className="row-icon" style={{ background: '#34c759' }}>
            <Icon name="books" size={16} stroke={2} />
          </span>
          <span className="row-label">Page Turn</span>
          <div className="segmented compact">
            {(['slide', 'scroll'] as const).map((p) => (
              <button key={p} aria-pressed={s.pageTurn === p} onClick={() => setSettings({ pageTurn: p })}>
                {p === 'slide' ? 'Slide' : 'Scroll'}
              </button>
            ))}
          </div>
        </div>
        <div className="row static">
          <span className="row-icon" style={{ background: '#ffcc00' }}>
            <Icon name="sun" size={17} stroke={2} />
          </span>
          <span className="row-label">Keep Screen Awake</span>
          <Switch checked={s.keepAwake} onChange={(v) => setSettings({ keepAwake: v })} label="Keep screen awake" />
        </div>
        <div className="row static">
          <span className="row-icon" style={{ background: '#ff375f' }}>
            <Icon name="crop" size={16} stroke={2} />
          </span>
          <span className="row-label">Crop PDF Margins</span>
          <Switch checked={s.pdfCrop} onChange={(v) => setSettings({ pdfCrop: v })} label="Crop PDF margins" />
        </div>
      </div>
      <p className="group-footer">Tap the left or right edge of the page, or swipe, to turn pages. Tap the middle to show controls.</p>

      {session && (
        <>
          <div className="group-header">Sync</div>
          <div className="group">
            <div className="row static">
              <span className="row-icon" style={{ background: '#0a84ff' }}>
                <Icon name="cloud" size={17} stroke={2} />
              </span>
              <span className="row-label">Cloud Backup</span>
              <span className="row-value">
                {library ? `${library.backedUp} books · ${formatBytes(library.bytes)}` : '—'}
              </span>
            </div>
            <div className="row static">
              <span className="row-icon notion-icon">N</span>
              <span className="row-label">
                Notion
                <span className="caption" style={{ display: 'block' }}>
                  Highlights database in “Reader”
                </span>
              </span>
              <span className={`row-value${notion?.configured && !notion.error ? ' status-dot' : ''}`}>
                {!notion ? 'Checking…' : !notion.configured ? 'Not connected' : notion.error ? 'Needs attention' : 'Connected'}
              </span>
            </div>
            <div className="row static">
              <span className="row-icon" style={{ background: '#30b0c7' }}>
                <Icon name="quote" size={15} stroke={2} />
              </span>
              <span className="row-label">Auto-sync Highlights</span>
              <Switch checked={s.notionAutoSync} onChange={(v) => setSettings({ notionAutoSync: v })} label="Auto-sync highlights to Notion" />
            </div>
            <button className="row" onClick={syncNow} disabled={syncing}>
              <span className="row-icon" style={{ background: '#636366' }}>
                <Icon name="download" size={16} stroke={2} />
              </span>
              <span className="row-label">{syncing ? 'Syncing…' : 'Sync Now'}</span>
              <span className="row-value">{unsynced ? `${unsynced} pending` : 'Up to date'}</span>
            </button>
          </div>
        </>
      )}

      <div className="group-header">Data</div>
      <div className="group">
        <button
          className="row"
          onClick={async () => {
            const md = await highlightsMarkdown()
            if (!md.trim()) return toast('No highlights yet')
            await shareMarkdown(md, 'Folio Highlights')
          }}
        >
          <span className="row-icon" style={{ background: '#34c759' }}>
            <Icon name="share" size={16} stroke={2} />
          </span>
          <span className="row-label">Export Highlights as Markdown</span>
          <Icon name="chevron" size={16} stroke={2.4} className="row-chevron" />
        </button>
        <div className="row static">
          <span className="row-icon" style={{ background: '#8e8e93' }}>
            <Icon name="doc" size={16} stroke={2} />
          </span>
          <span className="row-label">Storage on This iPhone</span>
          <span className="row-value">{usage !== null ? formatBytes(usage) : '—'}</span>
        </div>
        {session && (
          <button
            className="row no-icon destructive"
            onClick={async () => {
              await supabase.auth.signOut()
              toast('Signed out')
            }}
          >
            <span className="row-label">Sign Out</span>
          </button>
        )}
      </div>
      <p className="caption" style={{ textAlign: 'center', margin: '8px 0 24px' }}>
        Folio 1.0
      </p>

      {picker === 'theme' && (
        <Sheet title="Theme" onClose={() => setPicker(null)}>
          <div className="group" style={{ margin: '0 0 8px' }}>
            {(Object.keys(THEME_LABEL) as ThemeChoice[]).map((t) => (
              <button key={t} className="row no-icon" onClick={() => setSettings({ theme: t })}>
                <span className="row-label">{THEME_LABEL[t]}</span>
                {s.theme === t && <Icon name="check" size={18} stroke={2.4} className="accent" />}
              </button>
            ))}
          </div>
          {s.theme === 'auto' && (
            <>
              <p className="sheet-label">At night, use</p>
              <div className="group" style={{ margin: '0 0 8px' }}>
                {(['dark', 'black'] as const).map((t) => (
                  <button key={t} className="row no-icon" onClick={() => setSettings({ autoDark: t })}>
                    <span className="row-label">{THEME_LABEL[t]}</span>
                    {s.autoDark === t && <Icon name="check" size={18} stroke={2.4} className="accent" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </Sheet>
      )}
      {picker === 'font' && (
        <Sheet title="Reading Font" onClose={() => setPicker(null)}>
          <div className="group" style={{ margin: '0 0 8px' }}>
            {(Object.keys(FONT_STACKS) as ReaderFont[]).map((f) => (
              <button key={f} className="row no-icon" onClick={() => setSettings({ font: f })}>
                <span className="row-label" style={{ fontFamily: FONT_STACKS[f].css, fontSize: 19 }}>
                  {FONT_STACKS[f].label}
                </span>
                {s.font === f && <Icon name="check" size={18} stroke={2.4} className="accent" />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}
