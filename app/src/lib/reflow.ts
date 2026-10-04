import JSZip from 'jszip'
import { db } from './db'
import { openPdf, type OpenPdf } from './pdf'

/**
 * "Text view" for PDFs: extract the text, rebuild lines → paragraphs → headings, drop running
 * headers/footers and page numbers, and package it as an EPUB so it reads (and themes, highlights,
 * searches) exactly like an ebook. Each PDF page leaves an anchor (#pN) so both views can hand off.
 */

export interface ReflowMeta {
  pages: number
  /** first PDF page of each generated section, in order */
  sections: { href: string; startPage: number; title: string }[]
}

const REFLOW_VERSION = 8
const key = (bookId: string) => `${bookId}#reflow${REFLOW_VERSION}`

interface Item {
  str: string
  x: number
  y: number
  w: number
  size: number
}
interface Line {
  text: string
  x: number
  right: number
  y: number
  size: number
  page: number
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

async function pageLines(doc: OpenPdf, n: number) {
  const page = await doc.getPage(n)
  const vp = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  const items: Item[] = []
  for (const it of tc.items) {
    if (!('str' in it) || !it.str) continue
    const [a, b, c, d, e, f] = it.transform as number[]
    const size = Math.hypot(c, d) || Math.hypot(a, b) || it.height || 10
    // Skip rotated text (margins notes, watermarks).
    if (Math.abs(b) > 0.01 * size || Math.abs(c) > 0.01 * size) continue
    items.push({ str: it.str, x: e, y: f, w: it.width, size })
  }
  const width = vp.width
  const toLines = (group: Item[], shift = 0) => {
    group.sort((p, q) => q.y - p.y || p.x - q.x)
    const out: Line[] = []
    let cur: Item[] = []
    const flush = () => {
      if (!cur.length) return
      cur.sort((p, q) => p.x - q.x)
      let text = ''
      let end = -Infinity
      for (const it of cur) {
        const gap = it.x - end
        if (text && gap > it.size * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' '
        text += it.str
        end = it.x + it.w
      }
      text = text.replace(/\s+/g, ' ').trim()
      // Column lines are made relative to their column so indents and line lengths compare fairly.
      if (text) out.push({ text, x: cur[0].x - shift, right: end - shift, y: cur[0].y, size: median(cur.map((i) => i.size)), page: n })
      cur = []
    }
    for (const it of group) {
      if (cur.length && Math.abs(it.y - cur[0].y) > Math.max(cur[0].size, it.size) * 0.5) flush()
      cur.push(it)
    }
    flush()
    return out
  }

  // Two-column papers: find a vertical gutter near the middle that (almost) no text crosses.
  const gutter = findGutter(items, width)
  let lines: Line[]
  if (gutter === null) {
    lines = toLines(items)
  } else {
    const L: Item[] = [],
      R: Item[] = [],
      F: Item[] = []
    for (const it of items) {
      if (it.x + it.w <= gutter + 2) L.push(it)
      else if (it.x >= gutter - 2) R.push(it)
      else F.push(it) // spans both columns: title, abstract, wide figure captions
    }
    const full = toLines(F).map((l) => ({ ...l, kind: 'F' as const }))
    const left = toLines(L).map((l) => ({ ...l, kind: 'L' as const }))
    const right = toLines(R, gutter).map((l) => ({ ...l, kind: 'R' as const }))
    // Read top to bottom; full-width lines split the page into bands, and within a band the
    // left column is read before the right one.
    const all = [...full, ...left, ...right].sort((a, b) => b.y - a.y)
    lines = []
    let bandL: Line[] = [],
      bandR: Line[] = []
    // A narrow left side column holds notes (affiliations, dates, licence): read it after the main text.
    const sidebar = gutter < width * 0.38
    const emit = () => {
      if (sidebar) lines.push(...bandR, ...bandL)
      else lines.push(...bandL, ...bandR)
      bandL = []
      bandR = []
    }
    for (const l of all) {
      const { kind, ...line } = l
      if (kind === 'F') {
        emit()
        lines.push(line)
      } else if (kind === 'L') bandL.push(line)
      else bandR.push(line)
    }
    emit()
  }
  return { lines, height: vp.height, width: vp.width }
}

/** x position of a column gutter (two columns, or a narrow side column), or null for single-column pages. */
function findGutter(items: Item[], width: number): number | null {
  const body = items.filter((i) => i.str.trim().length > 3)
  if (body.length < 40) return null
  // Count how many text pieces cross each candidate line, then put the gutter in the middle of
  // the widest clean gap (placing it at a gap's edge would clip the column that starts there).
  const step = 2
  const samples: { x: number; c: number }[] = []
  for (let x = width * 0.22; x <= width * 0.62; x += step)
    samples.push({ x, c: body.filter((i) => i.x < x - 1 && i.x + i.w > x + 1).length })
  const min = Math.min(...samples.map((p) => p.c))
  const runs: { from: number; to: number }[] = []
  for (const p of samples) {
    if (p.c !== min) continue
    const last = runs[runs.length - 1]
    if (last && p.x - last.to <= step + 0.01) last.to = p.x
    else runs.push({ from: p.x, to: p.x })
  }
  const run = runs.sort((a, b) => Math.abs((a.from + a.to) / 2 - width / 2) - Math.abs((b.from + b.to) / 2 - width / 2))[0]
  const best: { x: number; crossings: number } | null = run ? { x: (run.from + run.to) / 2, crossings: min } : null
  if (!best) return null
  const leftN = body.filter((i) => i.x + i.w <= best!.x).length
  const rightN = body.filter((i) => i.x >= best!.x).length
  // A real gutter: few crossings, and plenty of text on both sides of it.
  // (Full-width titles/abstracts cross it on first pages; figures can leave one column sparse.)
  const ok =
    best.crossings <= body.length * 0.25 &&
    leftN >= Math.max(10, body.length * 0.15) &&
    rightN >= Math.max(10, body.length * 0.15)
  return ok ? best.x : null
}

/** Running headers/footers repeat across pages; page numbers are bare numerals. */
function stripFurniture(pages: { lines: Line[]; height: number }[]) {
  const all = pages.flatMap((p) => p.lines)
  const body = median(all.filter((l) => l.text.length > 30).map((l) => l.size)) || median(all.map((l) => l.size)) || 10
  const norm = (t: string) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ')
  const counts = new Map<string, number>()
  for (const p of pages) {
    const edge = p.lines.filter((l) => l.y > p.height * 0.9 || l.y < p.height * 0.1)
    for (const k of new Set(edge.map((l) => norm(l.text)))) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  // A real running header repeats on most pages; chapter titles at the top of a page don't.
  const threshold = Math.max(3, pages.length * 0.5)
  for (const p of pages) {
    p.lines = p.lines.filter((l) => {
      const atEdge = l.y > p.height * 0.9 || l.y < p.height * 0.1
      if (!atEdge) return true
      if (l.size > body * 1.15) return true // headings are bigger than body text; furniture isn't
      if (/^[\divxlcIVXLC\s.\-–—|]+$/.test(l.text) && l.text.length <= 12) return false
      return (counts.get(norm(l.text)) ?? 0) < threshold
    })
  }
}

interface Block {
  kind: 'p' | 'h1' | 'h2'
  text: string
  page: number
}

function toBlocks(pages: { lines: Line[]; width: number }[]): Block[] {
  const all = pages.flatMap((p) => p.lines)
  const body = median(all.filter((l) => l.text.length > 30).map((l) => l.size)) || median(all.map((l) => l.size)) || 10
  const gaps: number[] = []
  for (const p of pages) for (let i = 1; i < p.lines.length; i++) {
    const g = p.lines[i - 1].y - p.lines[i].y
    if (g > 0 && Math.abs(p.lines[i].size - body) < body * 0.15) gaps.push(g)
  }
  const lineGap = median(gaps) || body * 1.3
  const left = median(all.map((l) => l.x))
  const right = median(all.filter((l) => l.text.length > 30).map((l) => l.right))

  const blocks: Block[] = []
  let para: Line[] = []
  const emit = () => {
    if (!para.length) return
    let text = ''
    for (const l of para) {
      if (!text) text = l.text
      else if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(l.text)) text = text.slice(0, -1) + l.text
      else text += ' ' + l.text
    }
    const size = median(para.map((l) => l.size))
    const kind: Block['kind'] =
      size >= body * 1.6 && text.length < 280 ? 'h1' : size >= body * 1.2 && text.length < 200 ? 'h2' : 'p'
    blocks.push({ kind, text, page: para[0].page })
    para = []
  }
  for (const p of pages) {
    p.lines.forEach((l, i) => {
      const prev = i > 0 ? p.lines[i - 1] : para[para.length - 1]
      if (prev) {
        const samePage = prev.page === l.page
        const gap = samePage ? prev.y - l.y : lineGap
        const sizeChange = Math.abs(l.size - prev.size) > body * 0.15
        const bigGap = samePage && gap > lineGap * 1.45
        const indented = l.x > left + body * 1.2 && l.x - prev.x > body * 0.8
        const prevShort = prev.right < right - body * 3 && /[.!?:”"’)]$/.test(prev.text)
        // Multi-line titles/headings: same large size, spaced by their own (bigger) leading.
        const headingRun =
          samePage && l.size >= body * 1.2 && Math.abs(l.size - prev.size) < l.size * 0.08 && gap > 0 && gap < l.size * 1.9
        if (!headingRun && (sizeChange || bigGap || indented || prevShort)) emit()
      }
      para.push(l)
    })
  }
  emit()
  return blocks
}

async function outlineStarts(doc: OpenPdf) {
  const outline = await doc.getOutline().catch(() => null)
  const out: { title: string; page: number }[] = []
  for (const item of outline ?? []) {
    try {
      const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
      if (dest?.[0]) out.push({ title: item.title, page: (await doc.getPageIndex(dest[0])) + 1 })
    } catch {
      /* unresolved destination */
    }
  }
  return out.sort((a, b) => a.page - b.page).filter((o, i, arr) => i === 0 || o.page > arr[i - 1].page)
}

function xhtml(title: string, body: string) {
  return `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title>${esc(title)}</title></head><body>${body}</body></html>`
}

async function build(bookId: string, onProgress?: (done: number, total: number) => void) {
  const file = await db.files.get(bookId)
  const book = await db.books.get(bookId)
  if (!file || !book) throw new Error('Book file not found')
  const doc = await openPdf(await file.blob.arrayBuffer())
  try {
    const pages: { lines: Line[]; height: number; width: number }[] = []
    let chars = 0
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await pageLines(doc, n)
      chars += p.lines.reduce((s, l) => s + l.text.length, 0)
      pages.push(p)
      if (n % 5 === 0 || n === doc.numPages) onProgress?.(n, doc.numPages)
    }
    // Scanned books have (almost) no text layer; they can only be shown as pages.
    if (chars < doc.numPages * 40) return null
    stripFurniture(pages)
    const blocks = toBlocks(pages)

    let starts = await outlineStarts(doc)
    if (starts.length < 2) {
      starts = []
      for (let p = 1; p <= doc.numPages; p += 20) starts.push({ title: `Pages ${p}–${Math.min(doc.numPages, p + 19)}`, page: p })
    } else if (starts[0].page > 1) starts.unshift({ title: 'Beginning', page: 1 })

    const sections: ReflowMeta['sections'] = []
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
    zip.file(
      'META-INF/container.xml',
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    )
    let bi = 0
    starts.forEach((s, si) => {
      const end = si + 1 < starts.length ? starts[si + 1].page : Infinity
      let body = ''
      let lastPage = 0
      while (bi < blocks.length && blocks[bi].page < end) {
        const b = blocks[bi++]
        while (lastPage < b.page) body += `<span id="p${++lastPage}"></span>`
        body += `<${b.kind}>${esc(b.text)}</${b.kind}>`
      }
      const lastInSection = Math.min(doc.numPages, end - 1)
      while (lastPage < lastInSection && lastPage < doc.numPages) body += `<span id="p${++lastPage}"></span>`
      const href = `s${si + 1}.xhtml`
      sections.push({ href, startPage: s.page, title: s.title })
      zip.file(`OEBPS/${href}`, xhtml(s.title, body || '<p></p>'))
    })
    const nav = sections.map((s) => `<li><a href="${s.href}">${esc(s.title)}</a></li>`).join('')
    zip.file(
      'OEBPS/nav.xhtml',
      xhtml('Contents', `<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><ol>${nav}</ol></nav>`).replace(
        '<html xmlns="http://www.w3.org/1999/xhtml"',
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"',
      ),
    )
    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${esc(bookId)}-text</dc:identifier><dc:title>${esc(book.title)}</dc:title><dc:creator>${esc(book.author || '')}</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${sections
        .map((s, i) => `<item id="s${i + 1}" href="${s.href}" media-type="application/xhtml+xml"/>`)
        .join('')}</manifest><spine>${sections.map((_, i) => `<itemref idref="s${i + 1}"/>`).join('')}</spine></package>`,
    )
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
    const meta: ReflowMeta = { pages: doc.numPages, sections }
    return { blob, meta }
  } finally {
    await doc.close()
  }
}

/** Returns the cached text view, building it the first time. `null` means the PDF has no usable text. */
export async function getReflow(bookId: string, onProgress?: (done: number, total: number) => void) {
  const cached = await db.files.get(key(bookId))
  if (cached) return cached.meta ? { blob: cached.blob, meta: cached.meta as ReflowMeta } : null
  const result = await build(bookId, onProgress)
  await db.files.put(result ? { id: key(bookId), blob: result.blob, meta: result.meta } : { id: key(bookId), blob: new Blob([]) })
  return result
}

export function dropReflow(bookId: string) {
  return db.files.delete(key(bookId))
}

/** Where PDF page `n` lives in the text view. */
export function hrefForPage(meta: ReflowMeta, n: number) {
  let sec = meta.sections[0]
  for (const s of meta.sections) if (s.startPage <= n) sec = s
  return `${sec.href}#p${Math.max(1, Math.min(meta.pages, n))}`
}
