import { Component, type ReactNode } from 'react'
import { diag, errText } from '../lib/diag'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(error)
    diag('render-error', { path: location.pathname, error: errText(error), stack: info.componentStack?.slice(0, 600) })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="center-msg">
        <h2 style={{ margin: 0 }}>Something went wrong</h2>
        <p className="muted" style={{ margin: 0 }}>
          Your books and highlights are safe.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => {
            this.setState({ error: null })
            window.location.assign(import.meta.env.BASE_URL)
          }}
        >
          Back to Library
        </button>
      </div>
    )
  }
}
