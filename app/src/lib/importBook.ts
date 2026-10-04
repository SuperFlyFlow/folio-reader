import ePub from 'epubjs'
import { coverFields, db, type Book, type BookFormat } from './db'
import { openPdf } from './pdf'
import { backupBook } from './sync'

export const ACCEPT = '.pdf,.epub,application/pdf,application/epub+zip'

function formatOf(file: File): BookFormat | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (name.endsWith('.epub') || file.type === 'application/epub+zip') return 'epub'
  return null
}

function titleFromFilename(name: string) {
  return name
    .replace(/\.(pdf|epub)$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | undefined>((res) => canvas.toBlob((b) => res(b ?? undefined), 'image/jpeg', 0.85))
}

async function readEpubMeta(buf: ArrayBuffer) {
  const book = ePub(buf)
  try {
    await book.ready
    const meta = await book.loaded.metadata
    let cover: Blob | undefined
    const url = await book.coverUrl()
    if (url) cover = await (await fetch(url)).blob()
    return { title: meta.title, author: meta.creator, cover }
  } finally {
    book.destroy()
  }
}

async function readPdfMeta(buf: ArrayBuffer) {
  const doc = await openPdf(buf.slice(0))
  try {
    const { info } = (await doc.getMetadata()) as { info: { Title?: string; Author?: string } }
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 400 / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    return { title: info?.Title, author: info?.Author, pages: doc.numPages, cover: await canvasToBlob(canvas) }
  } finally {
    await doc.close()
  }
}

export async function importFiles(files: FileList | File[]) {
  const added: Book[] = []
  const skipped: string[] = []
  for (const file of Array.from(files)) {
    const format = formatOf(file)
    if (!format) {
      skipped.push(file.name)
      continue
    }
    const buf = await file.arrayBuffer()
    let meta: { title?: string; author?: string; cover?: Blob; pages?: number } = {}
    try {
      meta = format === 'epub' ? await readEpubMeta(buf) : await readPdfMeta(buf)
    } catch (e) {
      console.warn('metadata failed', file.name, e)
    }
    const book: Book = {
      id: crypto.randomUUID(),
      title: meta.title?.trim() || titleFromFilename(file.name),
      author: meta.author?.trim() || '',
      format,
      sizeBytes: file.size,
      totalPages: meta.pages,
      ...(await coverFields(meta.cover)),
      addedAt: Date.now(),
      backedUp: false,
      hasFile: true,
    }
    const blob = new Blob([buf], { type: format === 'pdf' ? 'application/pdf' : 'application/epub+zip' })
    await db.transaction('rw', db.books, db.files, async () => {
      await db.books.add(book)
      await db.files.add({ id: book.id, blob })
    })
    added.push(book)
    void backupBook(book.id)
  }
  return { added, skipped }
}
