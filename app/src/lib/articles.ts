import type { ArticleMeta, Book } from './db'
import type { OpenPdf } from './pdf'

/**
 * Paper metadata: find the DOI (or arXiv id) in the first pages, then look it up in Crossref
 * (journal articles) or DataCite (arXiv and other repository DOIs). Both are free and allow
 * browser requests.
 */

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>]+)/i
const ARXIV_RE = /arXiv:\s?(\d{4}\.\d{4,5})(v\d+)?/i

export function findIdentifier(text: string): string | undefined {
  const doi = text.match(DOI_RE)?.[1]
  if (doi) return doi.replace(/[).,;:\]}>]+$/, '')
  const arxiv = text.match(ARXIV_RE)?.[1]
  if (arxiv) return `10.48550/arXiv.${arxiv}`
  return undefined
}

const stripTags = (s?: string) =>
  s
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*(abstract)\s*/i, '')
    .trim() || undefined

async function fromCrossref(doi: string): Promise<(ArticleMeta & { title?: string }) | null> {
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)
  if (!res.ok) return null
  const m = (await res.json()).message
  return {
    doi,
    title: m.title?.[0],
    authors: (m.author ?? []).map((a: { given?: string; family?: string; name?: string }) =>
      [a.given, a.family].filter(Boolean).join(' ') || a.name || '',
    ),
    journal: m['container-title']?.[0] || m.publisher,
    year: m.issued?.['date-parts']?.[0]?.[0] ?? m.published?.['date-parts']?.[0]?.[0],
    abstract: stripTags(m.abstract),
    url: m.URL,
  }
}

async function fromDatacite(doi: string): Promise<(ArticleMeta & { title?: string }) | null> {
  const res = await fetch(`https://api.datacite.org/dois/${encodeURIComponent(doi.toLowerCase())}`)
  if (!res.ok) return null
  const a = (await res.json()).data?.attributes
  if (!a) return null
  return {
    doi,
    title: a.titles?.[0]?.title,
    authors: (a.creators ?? []).map((c: { givenName?: string; familyName?: string; name?: string }) =>
      [c.givenName, c.familyName].filter(Boolean).join(' ') || c.name || '',
    ),
    journal: a.publisher === 'arXiv' ? 'arXiv' : a.container?.title || a.publisher,
    year: a.publicationYear,
    abstract: stripTags(a.descriptions?.find((d: { descriptionType?: string }) => d.descriptionType === 'Abstract')?.description),
    url: a.url,
  }
}

export async function lookupArticle(id: string) {
  try {
    return (await fromCrossref(id)) ?? (await fromDatacite(id))
  } catch {
    return null // offline, or the services are unavailable
  }
}

/** Text of the first pages plus the most prominent line on page 1 (usually the paper's title). */
export async function firstPagesText(doc: OpenPdf, pages = 2) {
  let text = ''
  let title = ''
  let byline = ''
  let biggest = 0
  for (let n = 1; n <= Math.min(pages, doc.numPages); n++) {
    const tc = await (await doc.getPage(n)).getTextContent()
    const lines = new Map<number, { size: number; text: string }>()
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const t = it.transform as number[]
      const size = Math.hypot(t[2], t[3])
      const y = Math.round(t[5])
      const line = lines.get(y) ?? { size, text: '' }
      line.text += (line.text ? ' ' : '') + it.str.trim()
      line.size = Math.max(line.size, size)
      lines.set(y, line)
      text += it.str + (it.hasEOL ? '\n' : ' ')
    }
    if (n === 1) {
      // Title: the largest text on the first page; merge consecutive lines of that size.
      const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0])
      for (const [, l] of sorted) if (l.size > biggest + 0.5 && l.text.length > 8) biggest = l.size
      const titleLines = sorted.filter(([, l]) => Math.abs(l.size - biggest) < 0.5)
      title = titleLines
        .map(([, l]) => l.text)
        .join(' ')
        .slice(0, 300)
      // Byline: the first short line under the title that looks like a list of names.
      const below = titleLines.length ? titleLines[titleLines.length - 1][0] : Infinity
      const next = sorted.find(([y, l]) => y < below && l.size < biggest - 0.5 && l.text.length < 160)
      if (next && looksLikeNames(next[1].text)) byline = next[1].text
    }
  }
  return { text, title, byline }
}

function looksLikeNames(s: string) {
  if (/^(abstract|introduction|keywords|received|doi|http)/i.test(s) || /\d{3,}/.test(s)) return false
  const words = s.split(/[\s,;&]+/).filter((w) => w && !/^(and|by)$/i.test(w))
  const capitalised = words.filter((w) => /^[A-Z][\p{L}'’.-]*$/u.test(w) || /^[A-Z]\.$/.test(w))
  return words.length >= 2 && capitalised.length / words.length >= 0.7
}

export function authorLine(authors?: string[], max = 3) {
  if (!authors?.length) return ''
  const names = authors.filter(Boolean)
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} et al.`
}

export function sourceLine(a?: ArticleMeta) {
  return [a?.journal, a?.year].filter(Boolean).join(' · ')
}

/** APA-style reference, e.g. "LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature." */
export function citation(book: Pick<Book, 'title' | 'author' | 'article'>) {
  const a = book.article ?? {}
  const authors = (a.authors?.length ? a.authors : book.author ? [book.author] : []).map((full) => {
    const parts = full.trim().split(/\s+/)
    if (parts.length < 2) return full
    const family = parts.pop()!
    return `${family}, ${parts.map((p) => `${p[0]}.`).join(' ')}`
  })
  const who =
    authors.length > 1 ? `${authors.slice(0, -1).join(', ')}, & ${authors[authors.length - 1]}` : authors[0] ?? ''
  const year = a.year ? ` (${a.year}).` : ''
  const doi = a.doi ? ` https://doi.org/${a.doi}` : ''
  return `${who}${year} ${book.title}.${a.journal ? ` ${a.journal}.` : ''}${doi}`.trim()
}
