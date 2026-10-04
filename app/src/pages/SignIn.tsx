import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'

export default function SignIn({ onSkip }: { onSkip: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
          })
    setBusy(false)
    if (error) return setMessage({ kind: 'error', text: error.message })
    if (mode === 'signup' && !data.session) {
      setMessage({ kind: 'info', text: 'Check your email to confirm your account, then sign in here.' })
      setMode('signin')
    }
  }

  return (
    <div className="signin">
      <div className="signin-hero">
        <img className="app-mark" src={`${import.meta.env.BASE_URL}icon-192.png`} alt="Folio" width={84} height={84} />
        <h1>Folio</h1>
        <p>Your books, beautifully read.</p>
      </div>

      <form className="signin-form" onSubmit={submit}>
        <label className="field">
          <Icon name="envelope" size={20} />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <Icon name="lock" size={20} />
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="Password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {message && <p className={`signin-msg ${message.kind}`}>{message.text}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setMessage(null)
          }}
        >
          {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>

      <div className="signin-foot">
        <button className="link-btn muted" onClick={onSkip}>
          Continue without syncing
        </button>
        <p className="caption">Your books and highlights are private to your account and backed up securely.</p>
      </div>
    </div>
  )
}
