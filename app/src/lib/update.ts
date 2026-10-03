/**
 * iOS keeps serving an installed web app from its service-worker cache, so updates can lag for a
 * long time. Compare our build with the deployed version.json and, if they differ, drop the
 * cached app shell and reload. Books and highlights live in IndexedDB and are untouched.
 */
export async function ensureLatest() {
  if (import.meta.env.DEV) return
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const { build } = (await res.json()) as { build?: string }
    if (!build || build === __BUILD__) return
    // Guard against reload loops if the CDN briefly serves mixed versions.
    if (sessionStorage.getItem('folio.updating') === build) return
    sessionStorage.setItem('folio.updating', build)
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
    location.reload()
  } catch {
    /* offline: keep running the cached version */
  }
}
