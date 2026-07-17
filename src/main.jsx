import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// PWA: only register in production builds. In Vite dev, SW caches hashed chunks
// and causes 404s (chunk-XXXX.js) after restarts / dep re-optimize.
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  import.meta.env.PROD
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ignore offline install failures */
    });
  });
} else if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.DEV) {
  // Unregister any leftover SW from earlier sessions so dev always hits live Vite modules
  navigator.serviceWorker.getRegistrations?.().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => undefined);
  if (typeof caches !== 'undefined' && caches.keys) {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => undefined);
  }
}
