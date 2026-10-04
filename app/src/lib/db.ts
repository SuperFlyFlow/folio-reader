import Dexie, { type EntityTable } from 'dexie'

export type BookFormat = 'pdf' | 'epub'
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

export interface Book {
  id: string
  title: string
  author: string
  format: BookFormat
  sizeBytes: number
  totalPages?: number
  /** @deprecated legacy: a Blob kept in the record. iOS can corrupt Blobs that are read from and
   * written back to IndexedDB (which every record update does), so covers are stored as bytes. */
  cover?: Blob
  coverBytes?: ArrayBuffer
  coverType?: string
  addedAt: number
  lastOpenedAt?: number
  /** true once the file is stored in Supabase */
  backedUp: boolean
  /** false for books restored from the cloud whose file is not downloaded yet */
  hasFile: boolean
  /** PDFs only: read as reflowed text (default) or as the original pages */
  pdfView?: 'text' | 'pages'
  /** 'article' for journal articles and papers (shown in Library → Articles) */
  kind?: 'book' | 'article'
  article?: ArticleMeta
}

export interface ArticleMeta {
  doi?: string
  journal?: string
  year?: number
  authors?: string[]
  abstract?: string
  url?: string
}

export interface BookFile {
  id: string
  blob: Blob
  /** extra data for derived files (e.g. the PDF text view's page map) */
  meta?: unknown
}

export interface Progress {
  bookId: string
  location: string
  percent: number
  chapter?: string
  updatedAt: number
  dirty: 0 | 1
}

export interface Annotation {
  id: string
  bookId: string
  type: 'bookmark' | 'highlight' | 'note'
  location: string
  text?: string
  note?: string
  color?: HighlightColor
  chapter?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  deleted?: 0 | 1
  dirty: 0 | 1
}

export interface ReadingSession {
  id?: number
  bookId: string
  day: string // YYYY-MM-DD
  seconds: number
}

/** Plain-text index of a book, for library-wide search. */
export interface BookText {
  bookId: string
  sections: { href: string; label?: string; text: string }[]
}

export const db = new Dexie('folio') as Dexie & {
  books: EntityTable<Book, 'id'>
  files: EntityTable<BookFile, 'id'>
  progress: EntityTable<Progress, 'bookId'>
  annotations: EntityTable<Annotation, 'id'>
  sessions: EntityTable<ReadingSession, 'id'>
  texts: EntityTable<BookText, 'bookId'>
}

db.version(1).stores({
  books: 'id, title, author, addedAt, lastOpenedAt',
  files: 'id',
  progress: 'bookId, dirty',
  annotations: 'id, bookId, type, createdAt, dirty',
  sessions: '++id, day, bookId, [bookId+day]',
  texts: 'bookId',
})

/** Ask iOS not to evict our storage under pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* not supported */
  }
}

/** Cover image fields for a book record (bytes, never a Blob — see Book.cover). */
export async function coverFields(blob?: Blob | null) {
  if (!blob || !blob.size) return {}
  return { coverBytes: await blob.arrayBuffer(), coverType: blob.type || 'image/jpeg' }
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function logReading(bookId: string, seconds: number) {
  if (seconds < 1) return
  const day = today()
  const existing = await db.sessions.where({ bookId, day }).first()
  if (existing) await db.sessions.update(existing.id!, { seconds: existing.seconds + seconds })
  else await db.sessions.add({ bookId, day, seconds })
}
