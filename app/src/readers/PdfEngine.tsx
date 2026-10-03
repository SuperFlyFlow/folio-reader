import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { openPdf, pdfjs, type OpenPdf } from '../lib/pdf'
import { diag, errText } from '../lib/diag'
import { resolvedTheme, useSettings } from '../lib/settings'
import { HL_RGB, type EngineHandle, type EngineProps, type SearchHit, type TocItem } from './types'

let firstRenderLogged = false

const pageOf = (loc?: string) => Math.max(1, parseInt((loc || 'page:1').split(':')[1] || '1', 10) || 1)

interface Crop {
  x: number
  y: number
  w: number
  h: number
}

/** Finds the content bounding box of a rendered page (fractions of page size). */
function detectCrop(canvas: HTMLCanvasElement): Crop {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { width: w, height: h } = canvas
  const px = ctx.getImageData(0, 0, w, h).data
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4
      if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return { x: 0, y: 0, w: 1, h: 1 }
  const pad = 0.02
  const x = Math.max(0, minX / w - pad)
  const y = Math.max(0, minY / h - pad)
  return { x, y, w: Math.min(1, maxX / w + pad) - x, h: Math.min(1, maxY / h + pad) - y }
}

const PdfEngine = forwardRef<EngineHandle, EngineProps>(function PdfEngine(props, ref) {
  const settings = useSettings()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<OpenPdf | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [aspects, setAspects] = useState<number[]>([]) // height / width per page
  const [current, setCurrent] = useState(pageOf(props.initialLocation))
  const [zoomed, setZoomed] = useState<number | null>(null)
  const crops = useRef(new Map<number, Crop>())
  const textCache = useRef(new Map<number, string>())
  const propsRef = useRef(props)
  propsRef.current = props
  const paged = settings.pageTurn !== 'scroll'
  const theme = resolvedTheme(settings)

  /* ---------- open ---------- */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const t0 = Date.now()
      const buf = await props.data.arrayBuffer()
      diag('pdf-read-file', { bytes: buf.byteLength, ms: Date.now() - t0 })
      const doc = await openPdf(buf)
      diag('pdf-parsed', { pages: doc.numPages, ms: Date.now() - t0 })
      if (cancelled) return void doc.close()
      docRef.current = doc
      const first = await doc.getPage(1)
      const vp = first.getViewport({ scale: 1 })
      setAspects(Array(doc.numPages).fill(vp.height / vp.width))
      setNumPages(doc.numPages)
      propsRef.current.onReady(await readOutline(doc))
    })().catch((e) => !cancelled && propsRef.current.onError(e))
    return () => {
      cancelled = true
      void docRef.current?.close()
      docRef.current = null
    }
  }, [props.data])

  /* ---------- jump to initial page once laid out ---------- */
  const didInitialJump = useRef(false)
  useEffect(() => {
    if (!numPages || didInitialJump.current) return
    didInitialJump.current = true
    requestAnimationFrame(() => scrollToPage(pageOf(props.initialLocation), false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages])

  /* ---------- report location ---------- */
  useEffect(() => {
    if (!numPages) return
    propsRef.current.onRelocate({
      location: `page:${current}`,
      percent: numPages > 1 ? (current - 1) / (numPages - 1) : 1,
      pageLabel: `${current} / ${numPages}`,
      pagesLeft: numPages - current,
    })
  }, [current, numPages])

  function scrollToPage(n: number, smooth = true) {
    const el = scrollerRef.current
    if (!el) return
    const target = el.querySelector<HTMLElement>(`[data-page="${n}"]`)
    if (!target) return
    if (paged) el.scrollTo({ left: target.offsetLeft, behavior: smooth ? 'smooth' : 'auto' })
    else el.scrollTo({ top: target.offsetTop - 8, behavior: smooth ? 'smooth' : 'auto' })
    setCurrent(n)
  }

  function onScroll() {
    const el = scrollerRef.current
    if (!el || !numPages) return
    let n: number
    if (paged) n = Math.round(el.scrollLeft / el.clientWidth) + 1
    else {
      const mid = el.scrollTop + el.clientHeight / 2
      const slides = el.querySelectorAll<HTMLElement>('[data-page]')
      n = 1
      for (const s of slides) if (s.offsetTop <= mid) n = Number(s.dataset.page)
    }
    n = Math.min(numPages, Math.max(1, n))
    if (n !== current) {
      setCurrent(n)
      setZoomed(null)
    }
  }

  useImperativeHandle(ref, () => ({
    next: () => scrollToPage(Math.min(numPages, current + 1)),
    prev: () => scrollToPage(Math.max(1, current - 1)),
    goTo: (loc) => scrollToPage(pageOf(loc)),
    goToPercent: (p) => scrollToPage(Math.round(p * (numPages - 1)) + 1),
    clearSelection: () => window.getSelection()?.removeAllRanges(),
    search: async (q) => {
      const doc = docRef.current
      const needle = q.trim().toLowerCase()
      if (!doc || !needle) return []
      const hits: SearchHit[] = []
      for (let n = 1; n <= doc.numPages && hits.length < 200; n++) {
        const text = await pageText(doc, n)
        const lower = text.toLowerCase()
        let i = lower.indexOf(needle)
        while (i !== -1 && hits.length < 200) {
          const start = Math.max(0, i - 60)
          hits.push({
            location: `page:${n}`,
            excerpt: (start > 0 ? '…' : '') + text.slice(start, i + needle.length + 80).trim() + '…',
            chapter: `Page ${n}`,
          })
          i = lower.indexOf(needle, i + needle.length)
        }
      }
      return hits
    },
  }))

  async function pageText(doc: PDFDocumentProxy, n: number) {
    if (textCache.current.has(n)) return textCache.current.get(n)!
    const page = await doc.getPage(n)
    const tc = await page.getTextContent()
    const text = tc.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? ' ' : '') : '')).join('')
    textCache.current.set(n, text)
    return text
  }

  /* ---------- selection ---------- */
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection()
      const text = sel?.toString().trim()
      if (!sel || !text || !sel.rangeCount) return propsRef.current.onSelect(null)
      const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
      const slide = node?.closest<HTMLElement>('[data-page]')
      if (!slide || !scrollerRef.current?.contains(slide)) return
      const r = sel.getRangeAt(0).getBoundingClientRect()
      propsRef.current.onSelect({
        location: `page:${slide.dataset.page}`,
        text,
        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      })
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  /* ---------- taps ---------- */
  const lastTap = useRef(0)
  function onClick(e: React.MouseEvent) {
    if (window.getSelection()?.toString()) return
    const hl = (e.target as HTMLElement).closest<HTMLElement>('[data-hl]')
    if (hl) return propsRef.current.onHighlightTap(hl.dataset.hl!)
    const now = Date.now()
    const slide = (e.target as HTMLElement).closest<HTMLElement>('[data-page]')
    if (now - lastTap.current < 280 && slide) {
      lastTap.current = 0
      const n = Number(slide.dataset.page)
      setZoomed((z) => (z === n ? null : n))
      return
    }
    lastTap.current = now
    const rect = scrollerRef.current!.getBoundingClientRect()
    const zone = (e.clientX - rect.left) / rect.width
    window.setTimeout(() => {
      if (lastTap.current !== now) return // became a double tap
      if (!paged || zoomed || (zone > 0.3 && zone < 0.7)) propsRef.current.onTapCenter()
      else scrollToPage(zone >= 0.7 ? Math.min(numPages, current + 1) : Math.max(1, current - 1))
    }, 290)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return
      if (e.key === 'ArrowRight' || e.key === ' ') scrollToPage(Math.min(numPages, current + 1))
      if (e.key === 'ArrowLeft') scrollToPage(Math.max(1, current - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const filter =
    theme === 'dark' || theme === 'black'
      ? 'invert(0.9) hue-rotate(180deg) contrast(0.95)'
      : theme === 'sepia'
        ? 'sepia(0.35) brightness(0.96)'
        : 'none'

  return (
    <div
      ref={scrollerRef}
      className={`engine pdf-engine ${paged ? 'paged' : 'scrolled'}`}
      onScroll={onScroll}
      onClick={onClick}
      style={{ ['--pdf-filter' as string]: filter }}
    >
      {aspects.map((aspect, i) => (
        <PdfPage
          key={i}
          n={i + 1}
          doc={docRef.current}
          aspect={aspect}
          near={Math.abs(i + 1 - current) <= 2}
          paged={paged}
          zoomed={zoomed === i + 1}
          crop={settings.pdfCrop}
          crops={crops.current}
          annotations={props.annotations}
        />
      ))}
    </div>
  )
})

async function readOutline(doc: PDFDocumentProxy): Promise<TocItem[]> {
  const outline = await doc.getOutline().catch(() => null)
  if (!outline) return []
  const out: TocItem[] = []
  const walk = async (items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>, depth: number) => {
    for (const item of items ?? []) {
      let page = 1
      try {
        const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
        if (dest?.[0]) page = (await doc.getPageIndex(dest[0])) + 1
      } catch {
        /* unresolved destination */
      }
      out.push({ label: item.title, href: `page:${page}`, depth })
      if (item.items?.length) await walk(item.items, depth + 1)
    }
  }
  await walk(outline, 0)
  return out
}

function PdfPage({
  n,
  doc,
  aspect,
  near,
  paged,
  zoomed,
  crop,
  crops,
  annotations,
}: {
  n: number
  doc: PDFDocumentProxy | null
  aspect: number
  near: boolean
  paged: boolean
  zoomed: boolean
  crop: boolean
  crops: Map<number, Crop>
  annotations: EngineProps['annotations']
}) {
  const slideRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [rendered, setRendered] = useState(false)
  const [pageAspect, setPageAspect] = useState(aspect)
  const [cropBox, setCropBox] = useState<Crop | null>(null)

  // Measure available space.
  useEffect(() => {
    const el = slideRef.current!
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Compute crop (once per page) when enabled.
  useEffect(() => {
    if (!crop || !doc || !near) return setCropBox(null)
    if (crops.has(n)) return setCropBox(crops.get(n)!)
    let dead = false
    ;(async () => {
      const page = await doc.getPage(n)
      const vp = page.getViewport({ scale: 200 / page.getViewport({ scale: 1 }).width })
      const c = document.createElement('canvas')
      c.width = Math.round(vp.width)
      c.height = Math.round(vp.height)
      await page.render({ canvas: c, viewport: vp }).promise
      const cb = detectCrop(c)
      crops.set(n, cb)
      if (!dead) setCropBox(cb)
    })()
    return () => {
      dead = true
    }
  }, [crop, doc, near, n, crops])

  const c = crop && cropBox ? cropBox : { x: 0, y: 0, w: 1, h: 1 }
  const visibleAspect = (pageAspect * c.h) / c.w
  const gutter = paged ? 12 : 8
  const availW = Math.max(0, box.w - gutter * 2)
  const availH = paged ? Math.max(0, box.h - 24) : Infinity
  let dispW = availW
  if (paged && dispW * visibleAspect > availH) dispW = availH / visibleAspect
  if (zoomed) dispW *= 2
  const dispH = dispW * visibleAspect
  // Full page size in CSS px so the visible (cropped) part is dispW wide.
  const fullW = dispW / c.w
  const fullH = fullW * pageAspect

  // Render canvas + text layer + highlights.
  useEffect(() => {
    const host = boxRef.current
    if (!host) return
    if (!near || !doc || !fullW) {
      host.replaceChildren()
      setRendered(false)
      return
    }
    let dead = false
    let task: ReturnType<PDFPageProxy['render']> | null = null
    ;(async () => {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const a = base.height / base.width
      if (Math.abs(a - pageAspect) > 0.001) setPageAspect(a)
      const scale = fullW / base.width
      const vp = page.getViewport({ scale })
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(vp.width * dpr)
      canvas.height = Math.floor(vp.height * dpr)
      canvas.style.width = `${vp.width}px`
      canvas.style.height = `${vp.height}px`
      canvas.className = 'pdf-canvas'
      task = page.render({ canvas, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
      await task.promise
      if (dead) return
      const layer = document.createElement('div')
      layer.className = 'textLayer'
      layer.style.setProperty('--total-scale-factor', String(scale))
      layer.style.setProperty('--scale-round-x', '1px')
      layer.style.setProperty('--scale-round-y', '1px')
      const tl = new pdfjs.TextLayer({ textContentSource: await page.getTextContent(), container: layer, viewport: vp })
      await tl.render()
      if (dead) return
      const marks = document.createElement('div')
      marks.className = 'pdf-marks'
      host.replaceChildren(canvas, marks, layer)
      setRendered(true)
      if (!firstRenderLogged) {
        firstRenderLogged = true
        diag('pdf-first-render', { page: n, w: canvas.width, h: canvas.height })
      }
    })().catch((e) => {
      if (!dead && e?.name !== 'RenderingCancelledException') {
        console.warn('pdf render', e)
        diag('pdf-render-error', { page: n, error: errText(e) })
      }
    })
    return () => {
      dead = true
      task?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, doc, n, Math.round(fullW)])

  // Paint highlights by locating their text in the text layer.
  useEffect(() => {
    const host = boxRef.current
    if (!host || !rendered) return
    const marks = host.querySelector<HTMLElement>('.pdf-marks')
    const layer = host.querySelector<HTMLElement>('.textLayer')
    if (!marks || !layer) return
    marks.replaceChildren()
    const mine = annotations.filter((a) => a.type !== 'bookmark' && !a.deleted && pageOf(a.location) === n && a.text)
    if (!mine.length) return
    const nodes: { node: Text; start: number }[] = []
    let full = ''
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      nodes.push({ node: t, start: full.length })
      full += t.data
    }
    const norm = (s: string) => s.replace(/\s+/g, '')
    // Map normalized index -> raw index so whitespace differences don't break matching.
    const rawIdx: number[] = []
    for (let i = 0; i < full.length; i++) if (!/\s/.test(full[i])) rawIdx.push(i)
    const fullNorm = norm(full)
    const hostRect = host.getBoundingClientRect()
    const locate = (raw: number) => {
      let lo = 0
      for (let k = 0; k < nodes.length; k++) if (nodes[k].start <= raw) lo = k
      return { node: nodes[lo].node, offset: raw - nodes[lo].start }
    }
    for (const a of mine) {
      const q = norm(a.text!)
      const at = fullNorm.indexOf(q)
      if (at < 0 || !q) continue
      const s = locate(rawIdx[at])
      const e = locate(rawIdx[at + q.length - 1] + 1)
      const range = document.createRange()
      try {
        range.setStart(s.node, s.offset)
        range.setEnd(e.node, Math.min(e.offset, e.node.length))
      } catch {
        continue
      }
      for (const r of range.getClientRects()) {
        const m = document.createElement('div')
        m.className = 'pdf-mark'
        m.dataset.hl = a.id
        Object.assign(m.style, {
          left: `${r.left - hostRect.left}px`,
          top: `${r.top - hostRect.top}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
          background: HL_RGB[a.color ?? 'yellow'],
        })
        marks.appendChild(m)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, rendered, n, Math.round(fullW)])

  return (
    <div ref={slideRef} className={`pdf-slide${zoomed ? ' zoomed' : ''}`} data-page={n} style={paged ? undefined : { height: dispH + gutter }}>
      <div className="pdf-window" style={{ width: dispW, height: dispH }}>
        <div
          ref={boxRef}
          className="pdf-page"
          style={{ width: fullW, height: fullH, transform: `translate(${-c.x * fullW}px, ${-c.y * fullH}px)` }}
        />
        {!rendered && near && <div className="pdf-loading" />}
      </div>
    </div>
  )
}

export default PdfEngine
