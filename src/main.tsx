import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles.css'

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state: { failed: boolean; message: string } = { failed: false, message: '' }

  static getDerivedStateFromError(error: Error) { return { failed: true, message: error.message } }

  componentDidCatch(error: Error) { console.error('LifeOS failed to render', error) }

  render() {
    if (this.state.failed) return <main className="loading app-start-error"><h1>LifeOS couldn’t open</h1><p>Refresh the page to try again. Your saved data is unchanged.</p>{this.state.message && <code className="startup-error-detail">{this.state.message}</code>}<button className="primary" onClick={() => window.location.reload()}>Refresh LifeOS</button></main>
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(error => console.error('LifeOS offline shell registration failed', error))
  })
}
