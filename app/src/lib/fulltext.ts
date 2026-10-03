import ePub from 'epubjs'
import { db, type Book, type BookText } from './db'
import { openPdf } from './pdf'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function extractEpub(blob: Blob): Promise<BookText['sections']> {
  const book: any = ePub(await blob.arrayBuffer())
  try {
    await book.ready
    const nav = await book.loaded.navigation
    const labels = new Map<string, string>()
    const walk = (items: any[]) =>
      items.forEach((i) => {
        labels.set(i.href.split('#')[0], i.label.trim())
        if (i.subitems) walk(i.subitems)
      })
    walk(nav.toc)
    const sections: BookText['sections'] = []
    for (const item of book.spine.spineItems) {
      try {
        await item.load(book.load.bind(book))
        const text = (item.document?.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
        const label = [...labels].find(([h]) => item.href.endsWith(h) || h.endsWith(item.href))?.[1]
        if (text) sections.push({ href: item.href, label, text })
        item.unload()
      } catch {
        /* unreadable section */
      }
    }
    return sections
  } finally {
    book.destroy()
  }
}

async function extractPdf(blob: Blob): Promise<BookText['sections']> {
  const doc = await openPdf(await blob.arrayBuffer())
  try {
    const sections: BookText['sections'] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const tc = await (await doc.getPage(n)).getTextContent()
      const text = tc.items
        .map((i: any) => (i.str ?? '') + (i.hasEOL ? ' ' : ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) sections.push({ href: `page:${n}`, label: `Page ${n}`, text })
    }
    return sections
  } finally {
    await doc.close()
  }
}

export async function ensureIndexed(book: Book) {
  const existing = await db.texts.get(book.id)
  if (existing) return existing
  const file = await db.files.get(book.id)
  if (!file) return null
  const sections = book.format === 'pdf' ? await extractPdf(file.blob) : await extractEpub(file.blob)
  const entry = { bookId: book.id, sections }
  await db.texts.put(entry)
  return entry
}

export interface LibraryHit {
  href: string
  label?: string
  excerpt: string
  /** occurrence index within this section, used to land on the right match */
  nth: number
}

export function searchText(entry: BookText, query: string, limit = 25): LibraryHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: LibraryHit[] = []
  for (const s of entry.sections) {
    const lower = s.text.toLowerCase()
    let i = lower.indexOf(q)
    let nth = 0
    while (i !== -1 && hits.length < limit) {
      const start = Math.max(0, s.text.lastIndexOf(' ', Math.max(0, i - 70)))
      const end = s.text.indexOf(' ', Math.min(s.text.length, i + q.length + 90))
      hits.push({
        href: s.href,
        label: s.label,
        excerpt: (start > 0 ? '…' : '') + s.text.slice(start, end === -1 ? undefined : end).trim() + (end === -1 ? '' : '…'),
        nth,
      })
      nth++
      i = lower.indexOf(q, i + q.length)
    }
    if (hits.length >= limit) break
  }
  return hits
}
