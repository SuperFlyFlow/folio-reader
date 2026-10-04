import { lazy, Suspense, useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { syncAll } from './lib/sync'
import { diag, errText } from './lib/diag'
import { TabBar, ToastHost } from './components/ui'
import ErrorBoundary from './components/ErrorBoundary'
import SignIn from './pages/SignIn'
import Library from './pages/Library'
import BookDetails from './pages/BookDetails'
import Notes from './pages/Notes'
import Reading from './pages/Reading'
import Settings from './pages/Settings'
const Search = lazy(() => import('./pages/Search'))
const Reader = lazy(() => import('./readers/Reader'))

/** Spinner that offers a reload if a code chunk never arrives. */
function SlowLoad() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 12000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="center-msg">
      <div className="spinner" />
      <p className="muted">{slow ? 'The reader is taking a while to load.' : 'Loading reader…'}</p>
      {slow && (
        <button className="btn btn-secondary" onClick={() => window.location.reload()}>
          Reload
        </button>
      )}
    </div>
  )
}

const OFFLINE_KEY = 'folio.offline'
const TAB_ROUTES = ['/', '/reading', '/notes', '/settings']

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [offline, setOffline] = useState(() => {
    try {
      return localStorage.getItem(OFFLINE_KEY) === '1'
    } catch {
      return false
    }
  })
  const { pathname } = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Report errors from any screen (not just the reader) so phone-only problems show up remotely.
  useEffect(() => {
    const onErr = (ev: ErrorEvent) => diag('app-error', { path: location.pathname, error: errText(ev.error ?? ev.message) })
    const onRej = (ev: PromiseRejectionEvent) => diag('app-error', { path: location.pathname, error: errText(ev.reason) })
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
    }
  }, [])

  useEffect(() => {
    if (session === undefined) return
    // Repair covers once per launch (cheap when there's nothing to do); lazy so pdf.js loads only if needed.
    void import('./lib/repair').then((m) => m.repairCovers()).catch((e) => diag('cover-repair-error', { error: errText(e) }))
  }, [session])

  useEffect(() => {
    if (!session) return
    void syncAll()
    const onWake = () => document.visibilityState === 'visible' && void syncAll()
    window.addEventListener('online', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      window.removeEventListener('online', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [session])

  if (session === undefined) return <div className="app-frame" />

  if (!session && !offline) {
    return (
      <div className="app-frame">
        <SignIn
          onSkip={() => {
            try {
              localStorage.setItem(OFFLINE_KEY, '1')
            } catch {
              /* ignore */
            }
            setOffline(true)
          }}
        />
      </div>
    )
  }

  return (
    <div className="app-frame">
      <ErrorBoundary key={pathname}>
      <Suspense fallback={<SlowLoad />}>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/search" element={<Search />} />
        <Route path="/book/:id" element={<BookDetails />} />
        <Route path="/read/:id" element={<Reader />} />
        <Route path="/reading" element={<Reading />} />
        <Route path="/notes" element={<Notes />} />
        <Route
          path="/settings"
          element={
            <Settings
              session={session}
              onSignIn={() => {
                try {
                  localStorage.removeItem(OFFLINE_KEY)
                } catch {
                  /* ignore */
                }
                setOffline(false)
              }}
            />
          }
        />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      {TAB_ROUTES.includes(pathname) && <TabBar />}
      <ToastHost />
    </div>
  )
}
