import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './context/AppContext.tsx'
import device from './constants/device-browser.ts'


const start = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)

if (device.app) {
  document.addEventListener('deviceready', () => {
    start()
  })
} else {
    start()
}
