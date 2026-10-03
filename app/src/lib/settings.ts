import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'auto' | 'light' | 'sepia' | 'dark' | 'black'
export type ReaderFont = 'serif' | 'literata' | 'sourceserif' | 'sans'
export type PageTurn = 'slide' | 'scroll'

export interface Settings {
  theme: ThemeChoice
  /** which dark theme "auto" uses at night */
  autoDark: 'dark' | 'black'
  font: ReaderFont
  fontSize: number // percent
  lineHeight: number
  margin: number // px each side
  justify: boolean
  publisherStyles: boolean
  pageTurn: PageTurn
  keepAwake: boolean
  pdfCrop: boolean
  notionAutoSync: boolean
}

const DEFAULTS: Settings = {
  theme: 'auto',
  autoDark: 'dark',
  font: 'serif',
  fontSize: 100,
  lineHeight: 1.6,
  margin: 24,
  justify: true,
  publisherStyles: false,
  pageTurn: 'slide',
  keepAwake: true,
  pdfCrop: false,
  notionAutoSync: true,
}

const KEY = 'folio.settings'
let current: Settings = load()
const listeners = new Set<() => void>()

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return DEFAULTS
  }
}

export function getSettings() {
  return current
}

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage unavailable */
  }
  applyTheme()
  listeners.forEach((l) => l())
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}

export const FONT_STACKS: Record<ReaderFont, { label: string; css: string }> = {
  serif: { label: 'New York', css: "'New York', 'Literata', Georgia, serif" },
  literata: { label: 'Literata', css: "'Literata', Georgia, serif" },
  sourceserif: { label: 'Source Serif', css: "'Source Serif 4', Georgia, serif" },
  sans: { label: 'SF Pro', css: "-apple-system, 'SF Pro Text', system-ui, sans-serif" },
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

export function resolvedTheme(s = current): Exclude<ThemeChoice, 'auto'> {
  if (s.theme !== 'auto') return s.theme
  return darkQuery.matches ? s.autoDark : 'light'
}

export function applyTheme() {
  const t = resolvedTheme()
  document.documentElement.dataset.theme = t
  const meta = document.querySelectorAll('meta[name="theme-color"]')
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  meta.forEach((m) => m.setAttribute('content', color))
}

darkQuery.addEventListener('change', () => {
  applyTheme()
  listeners.forEach((l) => l())
})
