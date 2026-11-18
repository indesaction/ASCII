// Generates the app icons (halftone "ASCII orb") into /public.
// Usage: node scripts/make-icons.mjs   (needs Playwright's Chromium for PNGs)
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pub = fileURLToPath(new URL('../public/', import.meta.url))

function orb({ size = 512, pad = 0, bg = '#151515', ink = '#f3f0ea', accent = '#ff4a1c', radius = 0 }) {
  const N = 11
  const inner = size - pad * 2
  const cell = inner / N
  const cx = N / 2
  const cy = N / 2
  const R = N * 0.42
  const lx = -0.45
  const ly = -0.55
  let squares = ''
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - cx) / R
      const dy = (y + 0.5 - cy) / R
      const d2 = dx * dx + dy * dy
      if (d2 > 1) continue
      const dz = Math.sqrt(1 - d2)
      const light = Math.max(0, (dx * lx + dy * ly + dz * 0.7) / Math.hypot(lx, ly, 0.7))
      const s = cell * (0.18 + 0.72 * Math.pow(light, 0.9))
      const px = pad + x * cell + (cell - s) / 2
      const py = pad + y * cell + (cell - s) / 2
      squares += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${(s * 0.18).toFixed(1)}"/>`
    }
  }
  const dot = cell * 0.62
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>
<g fill="${ink}">${squares}</g>
<circle cx="${(size - pad - cell * 0.9).toFixed(1)}" cy="${(size - pad - cell * 0.9).toFixed(1)}" r="${(dot / 2).toFixed(1)}" fill="${accent}"/>
</svg>
`
}

const icon = orb({ radius: 112, pad: 48 })
const maskable = orb({ pad: 96 })
writeFileSync(pub + 'icon.svg', icon)
writeFileSync(pub + 'icon-maskable.svg', maskable)

try {
  const { createRequire } = await import('node:module')
  const { chromium } = createRequire(import.meta.url)('playwright')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const shots = [
    ['icon-192.png', icon, 192],
    ['icon-512.png', icon, 512],
    ['icon-maskable-512.png', maskable, 512],
    ['apple-touch-icon.png', orb({ pad: 44 }), 180],
  ]
  for (const [name, svg, px] of shots) {
    await page.setViewportSize({ width: px, height: px })
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${px}" height="${px}" `)}`)
    await page.screenshot({ path: pub + name, omitBackground: true })
  }
  await browser.close()
  console.log('icons written')
} catch (err) {
  console.warn('SVG icons written; PNG rendering skipped:', err.message)
}
