import { coverFields, db } from './db'
import { openPdf } from './pdf'
import { BUCKET, supabase } from './supabase'
import { diag, errText } from './diag'
import { CLASSICS, classicCover } from './classics'

/**
 * One-time repair for covers saved as Blobs inside book records (see Book.cover): convert them to
 * bytes, or — if iOS has already corrupted the Blob — restore them from the backup or re-render
 * them from the PDF's first page.
 */
export async function repairCovers() {
  await applyClassicCovers()
  const legacy = await db.books
    .filter((b) => !!b.cover || (b.format === 'pdf' && !b.coverBytes && b.hasFile))
    .toArray()
  if (!legacy.length) return
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  for (const b of legacy) {
    let fields: { coverBytes?: ArrayBuffer; coverType?: string } = {}
    try {
      fields = await coverFields(b.cover)
    } catch {
      /* corrupted Blob: fall through to restore */
    }
    if (!fields.coverBytes && uid && b.backedUp) {
      const { data: blob } = await supabase.storage.from(BUCKET).download(`${uid}/${b.id}-cover.jpg`)
      fields = await coverFields(blob).catch(() => ({}))
    }
    if (!fields.coverBytes && b.format === 'pdf') fields = await renderPdfCover(b.id).catch(() => ({}))
    await db.books.update(b.id, { ...fields, cover: undefined })
    diag('cover-repair', { bookId: b.id, restored: !!fields.coverBytes })
  }
}

async function renderPdfCover(bookId: string) {
  const file = await db.files.get(bookId)
  if (!file) return {}
  const doc = await openPdf(await file.blob.arrayBuffer())
  try {
    const page = await doc.getPage(1)
    const vp = page.getViewport({ scale: 400 / page.getViewport({ scale: 1 }).width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vp.width)
    canvas.height = Math.round(vp.height)
    await page.render({ canvas, viewport: vp }).promise
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    return coverFields(blob)
  } catch (e) {
    diag('cover-render-error', { bookId, error: errText(e) })
    return {}
  } finally {
    await doc.close()
  }
}

/** Give library copies of the Free Classics their artwork when they don't have a cover yet. */
async function applyClassicCovers() {
  const art = new Map(CLASSICS.filter((c) => !c.plainCover).map((c) => [c.title.toLowerCase(), c]))
  const missing = await db.books.filter((b) => !b.coverBytes && art.has(b.title.toLowerCase())).toArray()
  for (const b of missing) {
    try {
      const res = await fetch(classicCover(art.get(b.title.toLowerCase())!))
      if (!res.ok) continue
      await db.books.update(b.id, { ...(await coverFields(await res.blob())), cover: undefined, backedUp: false })
    } catch {
      /* offline: try again next launch */
    }
  }
}
