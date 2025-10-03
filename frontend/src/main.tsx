import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './context/AppContext.tsx'
import device from './constants/device-browser.ts'

// If a direct link lands with ?mode=receive|share&t=<token>, rewrite to hash route
(() => {
  try {
    const params = new URLSearchParams(window.location.search)
    const mode = (params.get('mode') || '').toLowerCase()
    const token = params.get('t') || params.get('token') || ''
    if ((mode === 'receive' || mode === 'share') && token && !window.location.hash) {
      const base = window.location.origin + window.location.pathname
      window.history.replaceState({}, '', `${base}#/${mode}/${token}`)
    }
  } catch {}
})()


const start = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)

if (device.app) {
  if ('cordova' in window) {
    document.addEventListener('deviceready', () => {
      start()
    })
  } else {
    start()
  }
} else {
    start()
}
