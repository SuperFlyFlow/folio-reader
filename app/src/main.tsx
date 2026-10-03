import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './app.css'
import App from './App'
import { applyTheme } from './lib/settings'
import { requestPersistence } from './lib/db'
import { ensureLatest } from './lib/update'

applyTheme()
void requestPersistence()
void ensureLatest()
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void ensureLatest())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
