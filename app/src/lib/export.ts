import { db, type Annotation, type Book } from './db'

export async function highlightsMarkdown(bookId?: string) {
  const books = new Map((await db.books.toArray()).map((b) => [b.id, b]))
  let notes = (await db.annotations.toArray()).filter((a) => a.type !== 'bookmark' && !a.deleted)
  if (bookId) notes = notes.filter((a) => a.bookId === bookId)
  const byBook = new Map<string, Annotation[]>()
  for (const a of notes.sort((x, y) => x.createdAt - y.createdAt)) {
    byBook.set(a.bookId, [...(byBook.get(a.bookId) ?? []), a])
  }
  const parts: string[] = []
  for (const [id, list] of byBook) {
    const b = books.get(id) as Book | undefined
    parts.push(`# ${b?.title ?? 'Unknown book'}${b?.author ? `\n*${b.author}*` : ''}\n`)
    let chapter: string | undefined
    for (const a of list) {
      if (a.chapter && a.chapter !== chapter) {
        chapter = a.chapter
        parts.push(`## ${chapter}\n`)
      }
      parts.push(`> ${a.text?.replace(/\n+/g, ' ')}\n`)
      if (a.note) parts.push(`${a.note}\n`)
      if (a.tags.length) parts.push(a.tags.map((t) => `#${t}`).join(' ') + '\n')
    }
  }
  return parts.join('\n')
}

/** Shares a Markdown file via the iOS share sheet, falling back to a download. */
export async function shareMarkdown(markdown: string, name: string) {
  const file = new File([markdown], `${name}.md`, { type: 'text/markdown' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name })
      return
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
