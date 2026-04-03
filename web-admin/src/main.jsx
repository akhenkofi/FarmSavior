import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

const BUILD_ID = '2026-04-03-phone-pane-v4'

async function forceFreshClient() {
  try {
    const prev = localStorage.getItem('farmsavior_build_id')
    if (prev !== BUILD_ID) {
      localStorage.setItem('farmsavior_build_id', BUILD_ID)

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((r) => r.unregister()))
      }

      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }

      const url = new URL(window.location.href)
      url.searchParams.set('v', BUILD_ID)
      window.location.replace(url.toString())
      return false
    }
  } catch (err) {
    console.error('Fresh client bootstrap failed:', err)
  }
  return true
}

forceFreshClient().then((okToRender) => {
  if (!okToRender) return
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
