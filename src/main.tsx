import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'

const SERVICE_WORKER_UPDATE_INTERVAL_MS = 5 * 60 * 1000
const SERVICE_WORKER_VERSION = '4'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let isReloadingForUpdate = false
    const hadController = Boolean(navigator.serviceWorker.controller)

    const checkForUpdates = (): void => {
      void navigator.serviceWorker.getRegistration().then((registration) => {
        void registration?.update().catch((error) => {
          console.error('Service worker update check failed:', error)
        })
      })
    }

    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'visible') {
        checkForUpdates()
      }
    }

    navigator.serviceWorker
      .register(`/sw.js?v=${SERVICE_WORKER_VERSION}`, { updateViaCache: 'none' })
      .then((registration) => {
        void registration.update().catch((error) => {
          console.error('Service worker immediate update check failed:', error)
        })
      })
      .catch((error) => {
        console.error('Service worker registration failed:', error)
      })

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || isReloadingForUpdate) return
      isReloadingForUpdate = true
      window.location.reload()
    })

    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.setInterval(refreshWhenVisible, SERVICE_WORKER_UPDATE_INTERVAL_MS)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
