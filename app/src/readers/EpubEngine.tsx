import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import ePub from 'epubjs'
import { FONT_STACKS, resolvedTheme, useSettings, type Settings } from '../lib/settings'
import { HL_RGB, type EngineHandle, type EngineProps, type SearchHit, type TocItem } from './types'

/* epubjs ships loose typings; we keep the surface we use small and typed here. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyBook = any
type AnyRendition = any

const THEME_COLORS: Record<string, { bg: string; ink: string; link: string; sel: string }> = {
  light: { bg: '#ffffff', ink: '#1c1c1e', link: '#5352ed', sel: 'rgba(83,82,237,.25)' },
  sepia: { bg: '#f8f1e3', ink: '#3b2f25', link: '#8a5a2b', sel: 'rgba(138,90,43,.25)' },
  dark: { bg: '#1c1c1e', ink: '#e5e5e7', link: '#9d9cff', sel: 'rgba(125,124,255,.35)' },
  black: { bg: '#000000', ink: '#d1d1d6', link: '#9d9cff', sel: 'rgba(125,124,255,.35)' },
}

function readerCss(s: Settings) {
  const t = THEME_COLORS[resolvedTheme(s)]
  const font = FONT_STACKS[s.font].css
  const force = s.publisherStyles ? '' : ' !important'
  return {
    html: { background: `${t.bg} !important` },
    body: {
      color: `${t.ink} !important`,
      background: `${t.bg} !important`,
      'font-family': `${font}${force}`,
      'line-height': `${s.lineHeight}${force}`,
      'text-align': s.justify ? `justify${force}` : `start${force}`,
      hyphens: s.justify ? 'auto' : 'manual',
      '-webkit-hyphens': s.justify ? 'auto' : 'manual',
      'text-rendering': 'optimizeLegibility',
      '-webkit-font-smoothing': 'antialiased',
      'font-kerning': 'normal',
      'font-variant-ligatures': 'common-ligatures',
      '-webkit-touch-callout': 'none',
    },
    'p, li, blockquote, dd': {
      'font-family': `${font}${force}`,
      'line-height': `${s.lineHeight}${force}`,
      color: s.publisherStyles ? 'inherit' : `${t.ink} !important`,
    },
    'h1, h2, h3, h4': {
      color: `${t.ink} !important`,
      'line-height': '1.25 !important',
      'text-align': 'start !important',
      'font-family': `${font}${force}`,
      'font-weight': s.publisherStyles ? 'inherit' : '600 !important',
      hyphens: 'manual',
    },
    ...(s.publisherStyles
      ? {}
      : {
          h1: { 'font-size': '1.6em !important' },
          h2: { 'font-size': '1.25em !important' },
        }),
    a: { color: `${t.link} !important`, 'text-decoration': 'none' },
    ...(s.publisherStyles
      ? {}
      : {
          // Margins come from the reader (column gap), not the book.
          body: {
            color: `${t.ink} !important`,
            background: `${t.bg} !important`,
            'font-family': `${font} !important`,
            'line-height': `${s.lineHeight} !important`,
            'text-align': s.justify ? 'justify !important' : 'start !important',
            margin: '0 !important',
            padding: '0 !important',
            hyphens: s.justify ? 'auto' : 'manual',
            '-webkit-hyphens': s.justify ? 'auto' : 'manual',
            'text-rendering': 'optimizeLegibility',
            '-webkit-font-smoothing': 'antialiased',
            '-webkit-touch-callout': 'none',
          },
          // One consistent text size: books often shrink whole sections (12–14px on a phone).
          'p, div, li, blockquote, dd, dt, td, th, section, article': { 'font-size': '1em !important' },
          // Clean, phone-friendly paragraphs: no hanging indents or deep side margins.
          p: {
            'margin-left': '0 !important',
            'margin-right': '0 !important',
            'margin-top': '0 !important',
            'margin-bottom': '0.85em !important',
            'text-indent': '0 !important',
            'padding-left': '0 !important',
            'padding-right': '0 !important',
          },
          blockquote: { margin: '0.9em 0 0.9em 1em !important', padding: '0 !important' },
          'h1, h2, h3, h4, h5, h6': { 'margin-top': '0.5em !important', 'margin-bottom': '0.8em !important' },
          // Chapter openings start part-way down the page, like a printed book.
          'h1, h2': { 'margin-top': '1.8em !important' },
          'h3, h4, h5, h6': { 'font-size': '1.08em !important' },
        }),
    '::selection': { background: t.sel },
    img: { 'max-width': '100% !important', height: 'auto !important' },
  }
}

function sanitize(doc: Document) {
  doc.querySelectorAll('script, iframe, object, embed').forEach((el) => el.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      else if ((name === 'href' || name.endsWith(':href') || name === 'src') && /^\s*javascript:/i.test(attr.value))
        el.removeAttribute(attr.name)
    }
  })
}

const EpubEngine = forwardRef<EngineHandle, EngineProps>(function EpubEngine(props, ref) {
  const settings = useSettings()
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<AnyBook>(null)
  const rendRef = useRef<AnyRendition>(null)
  const tocRef = useRef<TocItem[]>([])
  const propsRef = useRef(props)
  propsRef.current = props
  const drawn = useRef(new Map<string, string>()) // annotation id -> cfi
  const animating = useRef(false)
  /** Where the reader is now, so re-layouts (margins, page-turn mode) keep your place. */
  const currentCfi = useRef<string | undefined>(undefined)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  /* ---------- page turn animation ---------- */
  function animateTurn(dir: 1 | -1, fromDx = 0) {
    const stage = stageRef.current
    const rend = rendRef.current
    if (!stage || !rend || animating.current) return
    animating.current = true
    const w = stage.clientWidth
    stage.style.transition = 'transform 220ms cubic-bezier(.32,.72,0,1), opacity 220ms ease'
    stage.style.transform = `translateX(${-dir * w * 0.35}px)`
    stage.style.opacity = '0'
    void fromDx
    window.setTimeout(async () => {
      await (dir === 1 ? rend.next() : rend.prev())
      stage.style.transition = 'none'
      stage.style.transform = `translateX(${dir * w * 0.25}px)`
      stage.getBoundingClientRect()
      stage.style.transition = 'transform 260ms cubic-bezier(.32,.72,0,1), opacity 200ms ease'
      stage.style.transform = 'translateX(0)'
      stage.style.opacity = '1'
      window.setTimeout(() => (animating.current = false), 260)
    }, 200)
  }

  function snapBack() {
    const stage = stageRef.current
    if (!stage) return
    stage.style.transition = 'transform 260ms cubic-bezier(.32,.72,0,1), opacity 200ms ease'
    stage.style.transform = 'translateX(0)'
    stage.style.opacity = '1'
  }

  useImperativeHandle(ref, () => ({
    next: () => animateTurn(1),
    prev: () => animateTurn(-1),
    goTo: (loc) => void rendRef.current?.display(loc),
    goToPercent: (p) => {
      const book = bookRef.current
      if (!book?.locations?.length()) return
      void rendRef.current?.display(book.locations.cfiFromPercentage(Math.min(0.9999, Math.max(0, p))))
    },
    clearSelection: () => {
      rendRef.current?.getContents?.().forEach((c: any) => c.window.getSelection()?.removeAllRanges())
    },
    search: async (q: string): Promise<SearchHit[]> => {
      const book = bookRef.current
      if (!book || !q.trim()) return []
      const hits: SearchHit[] = []
      for (const item of book.spine.spineItems) {
        try {
          await item.load(book.load.bind(book))
          const found: { cfi: string; excerpt: string }[] = item.find(q.trim())
          const chapter = chapterFor(item.href)
          for (const f of found.slice(0, 50)) hits.push({ location: f.cfi, excerpt: f.excerpt, chapter, href: item.href })
          item.unload()
        } catch {
          /* skip unreadable section */
        }
        if (hits.length >= 200) break
      }
      return hits
    },
  }))

  function chapterFor(href: string) {
    const clean = href.split('#')[0]
    let match: TocItem | undefined
    for (const t of tocRef.current) if (t.href.split('#')[0].endsWith(clean) || clean.endsWith(t.href.split('#')[0])) match = match ?? t
    return match?.label
  }

  /* ---------- open book ---------- */
  useEffect(() => {
    let cancelled = false
    const host = hostRef.current!
    ;(async () => {
      const buf = await props.data.arrayBuffer()
      if (cancelled) return
      const book: AnyBook = ePub(buf)
      bookRef.current = book
      await book.opened
      if (cancelled) return
      // Pages render with scripts allowed (iOS Safari won't deliver taps to our listeners otherwise),
      // so make sure the book itself can't run any: strip scripts, inline handlers and js: links.
      const request = book.archive?.request?.bind(book.archive)
      if (request) {
        book.archive.request = async (url: string, type?: string) => {
          const res = await request(url, type)
          if (res && typeof (res as Document).querySelectorAll === 'function') sanitize(res as Document)
          return res
        }
      }
      const s = settingsRef.current
      const rendition: AnyRendition = book.renderTo(host, {
        width: '100%',
        height: '100%',
        flow: s.pageTurn === 'scroll' ? 'scrolled-doc' : 'paginated',
        spread: 'none',
        gap: s.margin * 2, // page margins; replaces epub.js's own ~1/12-width gap
        allowScriptedContent: true,
      })
      rendRef.current = rendition
      rendition.themes.default(readerCss(s))
      rendition.themes.fontSize(`${Math.round(s.fontSize * 1.19)}%`)

      rendition.hooks.content.register((contents: any) => attachGestures(contents))

      rendition.on('relocated', (loc: any) => {
        const cfi = loc.start.cfi
        currentCfi.current = cfi
        const percent = book.locations.length() ? book.locations.percentageFromCfi(cfi) : (loc.start.percentage ?? 0)
        const page = loc.start.displayed?.page ?? 1
        const total = loc.start.displayed?.total ?? 1
        propsRef.current.onRelocate({
          location: cfi,
          percent: loc.atEnd ? 1 : percent,
          chapter: chapterFor(loc.start.href),
          pageLabel: book.locations.length()
            ? `Page ${book.locations.locationFromCfi(cfi) + 1} of ${book.locations.length()}`
            : `${page} of ${total} in chapter`,
          pagesLeft: Math.max(0, total - page),
        })
      })

      rendition.on('selected', async (cfiRange: string, contents: any) => {
        const sel = contents.window.getSelection()
        const text = sel?.toString().trim()
        if (!text) return
        const r = sel.getRangeAt(0).getBoundingClientRect()
        const f = (contents.document.defaultView.frameElement as HTMLElement).getBoundingClientRect()
        propsRef.current.onSelect({
          location: cfiRange,
          text,
          rect: { top: r.top + f.top, bottom: r.bottom + f.top, left: r.left + f.left, right: r.right + f.left },
        })
      })

      await book.ready
      const nav = await book.loaded.navigation
      const flat: TocItem[] = []
      const walk = (items: any[], depth: number) =>
        items.forEach((i) => {
          flat.push({ label: (i.label || '').trim(), href: i.href, depth })
          if (i.subitems?.length) walk(i.subitems, depth + 1)
        })
      walk(nav.toc, 0)
      tocRef.current = flat
      propsRef.current.onReady(flat)

      // First open: skip a cover-only first page (e.g. Project Gutenberg's) and start at the title page.
      let start: string | undefined = currentCfi.current || props.initialLocation || undefined
      if (!start) {
        const first = book.spine.get(0)
        if (first && /cover/i.test(`${first.href ?? ''} ${first.idref ?? ''}`) && book.spine.get(1)) start = book.spine.get(1).href
      }
      await rendition.display(start)
      drawAnnotations()

      // Page-accurate percentages: cached per book after first generation.
      const key = `folio.loc.${book.key?.() ?? ''}${props.data.size}`
      let saved: string | null = null
      try {
        saved = localStorage.getItem(key)
      } catch {
        /* ignore */
      }
      if (saved) book.locations.load(saved)
      else {
        await book.locations.generate(1200)
        try {
          localStorage.setItem(key, book.locations.save())
        } catch {
          /* quota */
        }
      }
      if (!cancelled && rendition.location) rendition.emit('relocated', rendition.location)
    })().catch((e) => !cancelled && propsRef.current.onError(e))

    return () => {
      cancelled = true
      bookRef.current?.destroy()
      bookRef.current = null
      rendRef.current = null
      drawn.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.data, settings.pageTurn, settings.margin])

  /* ---------- live appearance changes ---------- */
  useEffect(() => {
    const r = rendRef.current
    if (!r) return
    r.themes.default(readerCss(settings))
    r.themes.fontSize(`${Math.round(settings.fontSize * 1.19)}%`)
    // Re-apply to already-rendered sections.
    r.getContents?.().forEach((c: any) => {
      c.addStylesheetRules?.(readerCss(settings))
    })
  }, [settings])

  /* ---------- highlights ---------- */
  function drawAnnotations() {
    const r = rendRef.current
    if (!r) return
    const wanted = new Map(
      propsRef.current.annotations
        .filter((a) => a.type !== 'bookmark' && !a.deleted && a.location.startsWith('epubcfi'))
        .map((a) => [a.id, a]),
    )
    for (const [id, cfi] of drawn.current) {
      const a = wanted.get(id)
      if (!a || a.location !== cfi || r.__colors?.[id] !== a.color) {
        r.annotations.remove(cfi, 'highlight')
        drawn.current.delete(id)
      }
    }
    r.__colors = r.__colors || {}
    for (const a of wanted.values()) {
      if (drawn.current.has(a.id)) continue
      const color = a.color ?? 'yellow'
      r.annotations.highlight(
        a.location,
        { id: a.id },
        () => propsRef.current.onHighlightTap(a.id),
        `hl-${color}`,
        { fill: HL_RGB[color], 'fill-opacity': '0.32', 'mix-blend-mode': 'multiply' },
      )
      r.__colors[a.id] = color
      drawn.current.set(a.id, a.location)
    }
  }
  useEffect(() => {
    drawAnnotations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.annotations])

  /* ---------- gestures inside the book iframe ---------- */
  function attachGestures(contents: any) {
    const doc: Document = contents.document
    // Hyphenation only works when the document declares a language.
    if (!doc.documentElement.lang) doc.documentElement.lang = bookRef.current?.packaging?.metadata?.language || 'en'
    let sx = 0,
      sy = 0,
      st = 0,
      dragging = false,
      moved = false
    const frame = () => (doc.defaultView!.frameElement as HTMLElement).getBoundingClientRect()
    const hasSelection = () => !!doc.getSelection()?.toString()

    doc.addEventListener('selectionchange', () => {
      if (!hasSelection()) propsRef.current.onSelect(null)
    })

    doc.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length !== 1) return
        sx = e.touches[0].clientX
        sy = e.touches[0].clientY
        st = Date.now()
        dragging = false
        moved = false
      },
      { passive: true },
    )
    doc.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (settingsRef.current.pageTurn === 'scroll' || hasSelection() || animating.current) return
        const dx = e.touches[0].clientX - sx
        const dy = e.touches[0].clientY - sy
        if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) dragging = true
        if (dragging) {
          moved = true
          e.preventDefault()
          const stage = stageRef.current!
          stage.style.transition = 'none'
          stage.style.transform = `translateX(${dx * 0.9}px)`
          stage.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / stage.clientWidth))
        }
      },
      { passive: false },
    )
    doc.addEventListener('touchend', (e: TouchEvent) => {
      if (!dragging) return
      const dx = e.changedTouches[0].clientX - sx
      const v = Math.abs(dx) / Math.max(1, Date.now() - st)
      dragging = false
      if (Math.abs(dx) > 60 || v > 0.4) animateTurn(dx < 0 ? 1 : -1, dx)
      else snapBack()
    })

    doc.addEventListener('click', (e: MouseEvent) => {
      if (moved || hasSelection()) return
      const target = e.target as HTMLElement
      if (target.closest('a')) return
      const f = frame()
      const host = hostRef.current!.getBoundingClientRect()
      const x = e.clientX + f.left - host.left
      const zone = x / host.width
      if (settingsRef.current.pageTurn === 'scroll' || (zone > 0.3 && zone < 0.7)) propsRef.current.onTapCenter()
      else animateTurn(zone >= 0.7 ? 1 : -1)
    })
  }

  /* ---------- keyboard (desktop / iPad keyboard) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return
      if (e.key === 'ArrowRight' || e.key === ' ') animateTurn(1)
      if (e.key === 'ArrowLeft') animateTurn(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const margin = settings.margin
  return (
    <div
      className="engine epub-engine"
      style={settings.pageTurn === 'scroll' ? { paddingLeft: margin, paddingRight: margin } : undefined}
      onClick={(e) => {
        // Taps on the side margins land outside the book's frame; treat them like page-edge taps.
        if (e.target !== e.currentTarget) return
        const r = e.currentTarget.getBoundingClientRect()
        const zone = (e.clientX - r.left) / r.width
        if (settings.pageTurn === 'scroll' || (zone > 0.3 && zone < 0.7)) propsRef.current.onTapCenter()
        else animateTurn(zone >= 0.7 ? 1 : -1)
      }}
    >
      <div ref={stageRef} className="epub-stage">
        <div ref={hostRef} className="epub-host" />
      </div>
    </div>
  )
})

export default EpubEngine
