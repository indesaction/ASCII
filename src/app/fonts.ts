import { FONT_FAMILY } from '../engine/glyphs'
import { clearRampCache } from '../engine/ramp'

export function fontUrl(weight: number): string {
  const file = weight >= 600 ? 'JetBrainsMonoNL-Bold.woff' : 'JetBrainsMonoNL-Regular.woff'
  return `${import.meta.env.BASE_URL}fonts/${file}`
}

let ready: Promise<void> | null = null

/** Load the bundled monospace font (used for both on-screen rendering and vector export). */
export function loadFonts(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      if (typeof FontFace === 'undefined') return
      const faces = [400, 700].map(
        (w) => new FontFace(FONT_FAMILY, `url(${fontUrl(w)}) format('woff')`, { weight: String(w), display: 'block' }),
      )
      const loaded = await Promise.allSettled(faces.map((f) => f.load()))
      for (const r of loaded) if (r.status === 'fulfilled') document.fonts.add(r.value)
      clearRampCache()
    })()
  }
  return ready
}
