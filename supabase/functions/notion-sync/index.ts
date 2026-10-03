// Pushes the signed-in user's new/changed highlights to their Notion "Highlights" database,
// and archives Notion pages for highlights deleted in the app.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   NOTION_TOKEN        internal integration secret (Notion_Token also accepted) (the database must be shared with it)
//   NOTION_DATABASE_ID  optional; defaults to the Highlights database created for Folio
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const NOTION_VERSION = '2022-06-28'
const TOKEN = Deno.env.get('NOTION_TOKEN') ?? Deno.env.get('Notion_Token') ?? ''
const DEFAULT_DB = 'd0ac6c3467594adb8cdfd922fbc08277'
const COLORS: Record<string, string> = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Notion caps each rich-text object at 2000 characters. */
const text = (s: string | null | undefined) =>
  s ? [{ type: 'text', text: { content: s.slice(0, 1990) } }] : []

/** Select option names may not contain commas. */
const option = (s: string) => s.replace(/,/g, ' ').trim().slice(0, 100) || 'Untitled'

async function notion(path: string, method: string, body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Notion ${res.status}: ${data.message ?? 'request failed'}`)
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!TOKEN) return json({ configured: false, synced: 0 })

  const body = (await req.json().catch(() => ({}))) as { archive?: string[]; check?: boolean }
  const database = Deno.env.get('NOTION_DATABASE_ID') || DEFAULT_DB

  // Connection check: can the token see the Highlights database? Reveals nothing else.
  if (body.check) {
    try {
      await notion(`databases/${database}`, 'GET')
      return json({ configured: true, databaseOk: true })
    } catch (e) {
      return json({ configured: true, databaseOk: false, error: String(e) })
    }
  }

  // Act as the caller so row-level security limits us to their own highlights.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return json({ error: 'Not signed in' }, 401)

  const archive = body.archive ?? []
  const errors: string[] = []

  for (const pageId of archive.slice(0, 50)) {
    try {
      await notion(`pages/${pageId}`, 'PATCH', { archived: true })
    } catch (e) {
      errors.push(String(e))
    }
  }

  const { data: rows, error } = await supabase
    .from('annotations')
    .select('id, text_excerpt, note, color, chapter, location, tags, created_at, updated_at, notion_page_id, notion_synced_at, books(title, author, format)')
    .neq('type', 'bookmark')
    .order('updated_at')
    .limit(200)
  if (error) return json({ error: error.message }, 500)

  const pending = (rows ?? []).filter(
    (r) => !r.notion_synced_at || Date.parse(r.notion_synced_at) < Date.parse(r.updated_at),
  )

  let synced = 0
  for (const r of pending.slice(0, 40)) {
    const book = (Array.isArray(r.books) ? r.books[0] : r.books) as { title?: string; author?: string } | null
    const properties = {
      Quote: { title: text(r.text_excerpt || '(highlight)') },
      Note: { rich_text: text(r.note) },
      Book: { select: { name: option(book?.title ?? 'Unknown book') } },
      Author: { rich_text: text(book?.author) },
      Location: { rich_text: text(r.chapter ?? '') },
      Color: r.color && COLORS[r.color] ? { select: { name: COLORS[r.color] } } : { select: null },
      Tags: { multi_select: (r.tags ?? []).slice(0, 20).map((t: string) => ({ name: option(t) })) },
      Highlighted: { date: { start: r.created_at } },
      'Reader ID': { rich_text: text(r.id) },
    }
    try {
      let pageId = r.notion_page_id as string | null
      if (pageId) await notion(`pages/${pageId}`, 'PATCH', { properties })
      else pageId = (await notion('pages', 'POST', { parent: { database_id: database }, properties })).id
      await supabase
        .from('annotations')
        .update({ notion_page_id: pageId, notion_synced_at: new Date().toISOString() })
        .eq('id', r.id)
      synced++
    } catch (e) {
      errors.push(String(e))
      if (String(e).includes('401') || String(e).includes('404')) break // token or sharing problem
    }
  }

  return json({ configured: true, synced, remaining: Math.max(0, pending.length - synced), errors: errors.slice(0, 5) })
})
