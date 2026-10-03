import { supabase } from './supabase'

/**
 * Remote diagnostics: writes small events to the signed-in user's own `client_logs` table,
 * so problems on the phone can be inspected without screenshots. Fire-and-forget.
 */
export function diag(kind: string, data: Record<string, unknown> = {}) {
  void (async () => {
    try {
      const { data: s } = await supabase.auth.getSession()
      if (!s.session) return
      await supabase.from('client_logs').insert({
        kind,
        data: { ...data, build: __BUILD__, ua: navigator.userAgent, standalone: matchMedia('(display-mode: standalone)').matches },
      })
    } catch {
      /* diagnostics must never break the app */
    }
  })()
}

export const errText = (e: unknown) =>
  e instanceof Error ? `${e.name}: ${e.message}` : typeof e === 'string' ? e : JSON.stringify(e)
