import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './styles/index.css'
import App from './App.tsx'
import { loadFonts } from './app/fonts'
import { studio } from './app/studio'
import { useApp } from './state/store'

// Glyph metrics depend on the bundled font: re-convert once it is ready.
void loadFonts().then(() => studio.invalidate('composite'))

if (import.meta.env.DEV) {
  // Handy for debugging and scripted browser tests.
  ;(window as unknown as Record<string, unknown>).__atelier = { useApp, studio }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

{
  const cs = getComputedStyle(document.documentElement)
  if (parseFloat(cs.paddingTop) > 0 || parseFloat(cs.paddingBottom) > 0) document.documentElement.classList.add('host-insets')
}

// Offline support for the standalone app (not when hosted inside another page).
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.top === window.self && !('claude' in window)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined)
  })
}
