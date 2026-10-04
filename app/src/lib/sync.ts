import { coverFields, db, type Annotation, type Book } from './db'
import { BUCKET, supabase } from './supabase'
import { getSettings } from './settings'

/** Free-tier per-file limit on Supabase Storage. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024

async function userId() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

const ext = (b: Book) => (b.format === 'pdf' ? 'pdf' : 'epub')

/** Upload a book's file + cover and create its row. Safe to call repeatedly. */
export async function backupBook(bookId: string) {
  const uid = await userId()
  if (!uid || !navigator.onLine) return
  const book = await db.books.get(bookId)
  if (!book || book.backedUp) return
  const file = await db.files.get(bookId)

  let filePath = ''
  if (file && book.sizeBytes <= MAX_BACKUP_BYTES) {
    filePath = `${uid}/${book.id}.${ext(book)}`
    const { error } = await supabase.storage.from(BUCKET).upload(filePath, file.blob, {
      upsert: true,
      contentType: file.blob.type,
    })
    if (error) {
      console.warn('upload failed', error)
      return
    }
  }
  let coverPath: string | null = null
  if (book.coverBytes) {
    coverPath = `${uid}/${book.id}-cover.jpg`
    const type = book.coverType || 'image/jpeg'
    await supabase.storage.from(BUCKET).upload(coverPath, new Blob([book.coverBytes], { type }), { upsert: true, contentType: type })
  }
  const { error } = await supabase.from('books').upsert({
    id: book.id,
    user_id: uid,
    title: book.title,
    author: book.author || null,
    format: book.format,
    file_path: filePath,
    cover_path: coverPath,
    size_bytes: book.sizeBytes,
    total_pages: book.totalPages ?? null,
    kind: book.kind ?? 'book',
    meta: book.article ?? {},
    created_at: new Date(book.addedAt).toISOString(),
    last_opened_at: book.lastOpenedAt ? new Date(book.lastOpenedAt).toISOString() : null,
  })
  if (!error) await db.books.update(book.id, { backedUp: filePath !== '' })
}

export async function deleteBookEverywhere(book: Book) {
  await db.transaction('rw', [db.books, db.files, db.progress, db.annotations], async () => {
    await db.books.delete(book.id)
    await db.files.where('id').startsWith(book.id).delete() // the book and its derived text view
    await db.progress.delete(book.id)
    await db.annotations.where('bookId').equals(book.id).delete()
  })
  const uid = await userId()
  if (!uid) return
  await supabase.from('books').delete().eq('id', book.id)
  await supabase.storage.from(BUCKET).remove([`${uid}/${book.id}.${ext(book)}`, `${uid}/${book.id}-cover.jpg`])
}

/** Fetch a cloud-only book's file into local storage. */
export async function downloadBookFile(book: Book) {
  const uid = await userId()
  if (!uid) throw new Error('Sign in to download this book')
  const { data, error } = await supabase.storage.from(BUCKET).download(`${uid}/${book.id}.${ext(book)}`)
  if (error || !data) throw error ?? new Error('Download failed')
  await db.files.put({ id: book.id, blob: data })
  await db.books.update(book.id, { hasFile: true })
}

async function pushDirty() {
  const uid = await userId()
  if (!uid) return
  const progress = await db.progress.where('dirty').equals(1).toArray()
  for (const p of progress) {
    const { error } = await supabase.from('reading_progress').upsert({
      book_id: p.bookId,
      user_id: uid,
      location: p.location,
      percent: p.percent,
      updated_at: new Date(p.updatedAt).toISOString(),
    })
    if (!error) await db.progress.update(p.bookId, { dirty: 0 })
  }
  const notes = await db.annotations.where('dirty').equals(1).toArray()
  const archive: string[] = []
  for (const a of notes) {
    if (a.deleted) {
      const { data } = await supabase.from('annotations').select('notion_page_id').eq('id', a.id).maybeSingle()
      if (data?.notion_page_id) archive.push(data.notion_page_id)
    }
    const { error } = a.deleted
      ? await supabase.from('annotations').delete().eq('id', a.id)
      : await supabase.from('annotations').upsert(toRow(a, uid))
    if (error) continue
    if (a.deleted) await db.annotations.delete(a.id)
    else await db.annotations.update(a.id, { dirty: 0 })
  }
  if (getSettings().notionAutoSync) await syncNotion(archive)
}

export interface NotionStatus {
  configured: boolean
  at: number
  synced?: number
  error?: string
}

export function notionStatus(): NotionStatus | null {
  try {
    return JSON.parse(localStorage.getItem('folio.notion') || 'null')
  } catch {
    return null
  }
}

/** Asks the edge function to push pending highlights to Notion. */
export async function syncNotion(archive: string[] = []) {
  const { data, error } = await supabase.functions.invoke('notion-sync', { body: { archive } })
  const status: NotionStatus = error
    ? { configured: notionStatus()?.configured ?? false, at: Date.now(), error: error.message }
    : { configured: !!data?.configured, at: Date.now(), synced: data?.synced, error: data?.errors?.[0] }
  try {
    localStorage.setItem('folio.notion', JSON.stringify(status))
  } catch {
    /* ignore */
  }
  return status
}

function toRow(a: Annotation, uid: string) {
  return {
    id: a.id,
    book_id: a.bookId,
    user_id: uid,
    type: a.type,
    location: a.location,
    text_excerpt: a.text ?? null,
    note: a.note ?? null,
    color: a.color ?? null,
    chapter: a.chapter ?? null,
    tags: a.tags,
    created_at: new Date(a.createdAt).toISOString(),
    updated_at: new Date(a.updatedAt).toISOString(),
  }
}

/** Bring down books/progress/highlights that exist in the cloud but not on this device. */
async function pullRemote() {
  const uid = await userId()
  if (!uid) return
  const { data: books } = await supabase.from('books').select('*')
  for (const r of books ?? []) {
    if (await db.books.get(r.id)) continue
    let cover = {}
    if (r.cover_path) {
      const { data } = await supabase.storage.from(BUCKET).download(r.cover_path)
      cover = await coverFields(data)
    }
    await db.books.add({
      id: r.id,
      title: r.title,
      author: r.author ?? '',
      format: r.format,
      sizeBytes: r.size_bytes ?? 0,
      totalPages: r.total_pages ?? undefined,
      ...cover,
      addedAt: Date.parse(r.created_at),
      lastOpenedAt: r.last_opened_at ? Date.parse(r.last_opened_at) : undefined,
      backedUp: !!r.file_path,
      hasFile: false,
      kind: r.kind ?? 'book',
      ...(r.kind === 'article' ? { article: r.meta ?? {}, pdfView: 'pages' as const } : {}),
    })
  }
  const { data: progress } = await supabase.from('reading_progress').select('*')
  for (const r of progress ?? []) {
    const local = await db.progress.get(r.book_id)
    const remoteAt = Date.parse(r.updated_at)
    if (!local || (local.updatedAt < remoteAt && !local.dirty)) {
      await db.progress.put({ bookId: r.book_id, location: r.location ?? '', percent: r.percent, updatedAt: remoteAt, dirty: 0 })
    }
  }
  const { data: notes } = await supabase.from('annotations').select('*')
  for (const r of notes ?? []) {
    const local = await db.annotations.get(r.id)
    const remoteAt = Date.parse(r.updated_at)
    if (!local || (local.updatedAt < remoteAt && !local.dirty)) {
      await db.annotations.put({
        id: r.id,
        bookId: r.book_id,
        type: r.type,
        location: r.location,
        text: r.text_excerpt ?? undefined,
        note: r.note ?? undefined,
        color: r.color ?? undefined,
        chapter: r.chapter ?? undefined,
        tags: r.tags ?? [],
        createdAt: Date.parse(r.created_at),
        updatedAt: remoteAt,
        dirty: 0,
      })
    }
  }
}

let running: Promise<void> | null = null

export function syncAll() {
  if (running || !navigator.onLine) return running
  running = (async () => {
    try {
      const pending = await db.books.filter((b) => !b.backedUp && b.hasFile).toArray()
      for (const b of pending) await backupBook(b.id)
      await pushDirty()
      await pullRemote()
    } catch (e) {
      console.warn('sync failed', e)
    } finally {
      running = null
    }
  })()
  return running
}

let timer: number | undefined
/** Debounced push after local edits (progress, highlights). */
export function scheduleSync(delay = 2500) {
  clearTimeout(timer)
  timer = window.setTimeout(() => void syncAll(), delay)
}
