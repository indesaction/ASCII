import { FONT_STACK } from '../engine/glyphs'
import { useApp, type SourceKind, type TextSettings } from '../state/store'
import { studio } from './studio'

const MAX_SIDE = 1600
const SVG_SIDE = 2048

function toast(text: string, tone: 'info' | 'error' | 'success' = 'info') {
  useApp.getState().toast(text, tone)
}

function canvasFrom(el: CanvasImageSource, w: number, h: number, max = MAX_SIDE): HTMLCanvasElement {
  const s = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * s))
  c.height = Math.max(1, Math.round(h * s))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(el, 0, 0, c.width, c.height)
  return c
}

function hasAlpha(c: HTMLCanvasElement): boolean {
  const t = document.createElement('canvas')
  t.width = 48
  t.height = 48
  const ctx = t.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(c, 0, 0, 48, 48)
  const d = ctx.getImageData(0, 0, 48, 48).data
  for (let i = 3; i < d.length; i += 4) if (d[i] < 245) return true
  return false
}

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode this image'))
    img.src = url
  })
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'Untitled'
}

export function setCanvasSource(c: HTMLCanvasElement, kind: SourceKind, name: string, mask = false): void {
  const alpha = hasAlpha(c)
  studio.setSource(
    { el: c, width: c.width, height: c.height, mask },
    { kind, name, width: c.width, height: c.height, live: false, hasAlpha: alpha },
  )
  useApp.setState({ title: name })
}

export async function openImage(blob: Blob, name: string): Promise<void> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImageEl(url)
    setCanvasSource(canvasFrom(img, img.naturalWidth, img.naturalHeight), 'image', baseName(name))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Rasterize SVG markup at high resolution (vector → crisp bitmap → ASCII). */
export async function openSvgText(text: string, name: string, kind: SourceKind = 'svg'): Promise<void> {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('This SVG could not be parsed')
  }
  let w = parseFloat(svg.getAttribute('width') || '')
  let h = parseFloat(svg.getAttribute('height') || '')
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number)
  if ((!w || !h) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    w = vb[2]
    h = vb[3]
  }
  if (!w || !h) {
    w = 1024
    h = 1024
  }
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  const s = SVG_SIDE / Math.max(w, h)
  const W = Math.round(w * s)
  const H = Math.round(h * s)
  svg.setAttribute('width', String(W))
  svg.setAttribute('height', String(H))
  const markup = new XMLSerializer().serializeToString(svg)
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const img = await loadImageEl(url)
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    c.getContext('2d')!.drawImage(img, 0, 0, W, H)
    setCanvasSource(c, kind, baseName(name))
  } finally {
    URL.revokeObjectURL(url)
  }
}

function hiddenVideo(): HTMLVideoElement {
  const v = document.createElement('video')
  v.muted = true
  v.loop = true
  v.playsInline = true
  v.setAttribute('playsinline', '')
  v.setAttribute('muted', '')
  Object.assign(v.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '2px',
    height: '2px',
    opacity: '0',
    pointerEvents: 'none',
  })
  document.body.appendChild(v)
  return v
}

function whenReady(v: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (v.readyState >= 2 && v.videoWidth) return resolve()
    v.onloadeddata = () => resolve()
    v.onerror = () => reject(new Error('This video could not be played'))
  })
}

export async function openVideo(file: File): Promise<void> {
  const v = hiddenVideo()
  v.src = URL.createObjectURL(file)
  await whenReady(v)
  await v.play().catch(() => undefined)
  studio.setSource(
    { el: v, width: v.videoWidth, height: v.videoHeight },
    { kind: 'video', name: baseName(file.name), width: v.videoWidth, height: v.videoHeight, live: true, hasAlpha: false },
    { video: v },
  )
  useApp.setState({ title: baseName(file.name) })
}

export async function startCamera(facing: 'user' | 'environment' = 'user'): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('The camera isn’t available here. Upload a photo or video instead.')
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
  } catch (err) {
    const name = (err as Error).name
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('Camera access is blocked. Allow it in your browser, or upload a photo or video instead.')
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new Error('No camera was found on this device.')
    throw err
  }
  const v = hiddenVideo()
  v.srcObject = stream
  await whenReady(v)
  await v.play().catch(() => undefined)
  studio.setSource(
    { el: v, width: v.videoWidth, height: v.videoHeight, mirror: facing === 'user' },
    { kind: 'camera', name: 'Camera', width: v.videoWidth, height: v.videoHeight, live: true, hasAlpha: false },
    { video: v, stream },
  )
  useApp.setState({ title: 'Live camera' })
}

export function freezeLive(): void {
  const c = studio.snapshot()
  if (!c) return
  const name = useApp.getState().source?.name ?? 'Snapshot'
  setCanvasSource(c, 'image', `${name} still`)
  toast('Frozen into a still image', 'success')
}

export async function openFile(file: File): Promise<void> {
  const type = file.type
  const lower = file.name.toLowerCase()
  try {
    if (lower.endsWith('.json') || type === 'application/json') {
      const { importProject } = await import('../export/project')
      await importProject(await file.text())
    } else if (type === 'image/svg+xml' || lower.endsWith('.svg')) {
      await openSvgText(await file.text(), file.name)
    } else if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/.test(lower)) {
      await openVideo(file)
    } else if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp|heic)$/.test(lower)) {
      await openImage(file, file.name)
    } else {
      throw new Error(`Unsupported file type: ${file.name}`)
    }
    useApp.getState().setTab('shape')
  } catch (err) {
    toast((err as Error).message || 'Could not open this file', 'error')
  }
}

// ---------------------------------------------------------------------------
// Text source
// ---------------------------------------------------------------------------

const TEXT_FONTS: Record<TextSettings['font'], string> = {
  display: '"Instrument Serif", Georgia, serif',
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: FONT_STACK,
}

export async function renderText(t: TextSettings): Promise<HTMLCanvasElement> {
  const size = 240
  const font = `${t.italic ? 'italic ' : ''}${t.weight} ${size}px ${TEXT_FONTS[t.font]}`
  try {
    await document.fonts.load(font, t.text || 'A')
  } catch {
    /* fall back to whatever is available */
  }
  const lines = (t.text || ' ').split('\n')
  const m = document.createElement('canvas').getContext('2d')!
  m.font = font
  const widths = lines.map((l) => m.measureText(l || ' ').width)
  const pad = size * 0.18
  const lh = size * 1.08
  const c = document.createElement('canvas')
  c.width = Math.ceil(Math.max(...widths) + pad * 2)
  c.height = Math.ceil(lines.length * lh + pad * 1.4)
  const ctx = c.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, c.width, c.height)
  grad.addColorStop(0, '#ff4a1c')
  grad.addColorStop(0.5, '#d63aa0')
  grad.addColorStop(1, '#2340ff')
  ctx.fillStyle = grad
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  lines.forEach((l, i) => ctx.fillText(l, c.width / 2, pad * 0.7 + (i + 0.8) * lh))
  return c
}

export async function openText(): Promise<void> {
  const t = useApp.getState().text
  const c = await renderText(t)
  setCanvasSource(c, 'text', t.text.split('\n')[0] || 'Text', true)
}

/** Re-render text without resetting edits (live typing). */
export async function refreshText(): Promise<void> {
  const s = useApp.getState()
  if (s.source?.kind !== 'text') return
  const c = await renderText(s.text)
  studio.updateSource({ el: c, width: c.width, height: c.height, mask: true }, { width: c.width, height: c.height })
}

// ---------------------------------------------------------------------------
// Samples (generated procedurally — no bundled photos)
// ---------------------------------------------------------------------------

function sampleOrb(): HTMLCanvasElement {
  const S = 1000
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')!
  const shadow = ctx.createRadialGradient(S * 0.5, S * 0.86, 10, S * 0.5, S * 0.86, S * 0.36)
  shadow.addColorStop(0, 'rgba(20,10,20,0.55)')
  shadow.addColorStop(1, 'rgba(20,10,20,0)')
  ctx.fillStyle = shadow
  ctx.save()
  ctx.translate(S * 0.5, S * 0.86)
  ctx.scale(1, 0.22)
  ctx.beginPath()
  ctx.arc(0, 0, S * 0.36, 0, Math.PI * 2)
  ctx.restore()
  ctx.fill()
  const g = ctx.createRadialGradient(S * 0.38, S * 0.32, S * 0.02, S * 0.5, S * 0.47, S * 0.36)
  g.addColorStop(0, '#fff8ec')
  g.addColorStop(0.18, '#ffc58f')
  g.addColorStop(0.5, '#ff5a2a')
  g.addColorStop(0.82, '#7a1240')
  g.addColorStop(1, '#2a0820')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(S * 0.5, S * 0.47, S * 0.34, 0, Math.PI * 2)
  ctx.fill()
  const rim = ctx.createRadialGradient(S * 0.5, S * 0.47, S * 0.27, S * 0.5, S * 0.47, S * 0.34)
  rim.addColorStop(0, 'rgba(80,120,255,0)')
  rim.addColorStop(1, 'rgba(80,120,255,0.45)')
  ctx.fillStyle = rim
  ctx.beginPath()
  ctx.arc(S * 0.5, S * 0.47, S * 0.34, 0, Math.PI * 2)
  ctx.fill()
  return c
}

function sampleAura(): HTMLCanvasElement {
  const W = 1200
  const H = 800
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#0c0a12'
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'lighter'
  const blobs: [number, number, number, string][] = [
    [0.3, 0.4, 0.42, '#ff4a1c'],
    [0.62, 0.35, 0.38, '#2340ff'],
    [0.5, 0.7, 0.36, '#d63aa0'],
    [0.8, 0.72, 0.3, '#ffd23a'],
    [0.16, 0.8, 0.28, '#00c49a'],
  ]
  for (const [x, y, r, col] of blobs) {
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * W)
    g.addColorStop(0, col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  ctx.globalCompositeOperation = 'source-over'
  return c
}

export function bloomSvg(): string {
  const petals = Array.from(
    { length: 12 },
    (_, i) =>
      `<ellipse cx="0" cy="-50" rx="15" ry="42" fill="url(#p)" opacity="0.92" transform="rotate(${i * 30})"/>`,
  ).join('')
  const inner = Array.from(
    { length: 8 },
    (_, i) => `<ellipse cx="0" cy="-26" rx="8" ry="20" fill="#111" transform="rotate(${i * 45 + 22.5})"/>`,
  ).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200">
<defs>
<linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4a1c"/><stop offset="1" stop-color="#ffd6a0"/></linearGradient>
<radialGradient id="c"><stop offset="0" stop-color="#6d7dff"/><stop offset="1" stop-color="#0b0b2a"/></radialGradient>
</defs>
<circle r="96" fill="none" stroke="#111" stroke-width="2.5"/>
${petals}${inner}
<circle r="16" fill="url(#c)"/>
</svg>`
}

export interface Sample {
  id: string
  name: string
  kind: string
  load(): Promise<void>
}

export const SAMPLES: Sample[] = [
  { id: 'orb', name: 'Orb', kind: 'Raster', load: async () => setCanvasSource(sampleOrb(), 'sample', 'Orb') },
  { id: 'bloom', name: 'Bloom', kind: 'Vector', load: () => openSvgText(bloomSvg(), 'Bloom', 'sample') },
  { id: 'aura', name: 'Aura', kind: 'Gradient', load: async () => setCanvasSource(sampleAura(), 'sample', 'Aura') },
  {
    id: 'type',
    name: 'Type',
    kind: 'Text',
    load: async () => {
      useApp.getState().setText({ text: 'Atelier', font: 'display', italic: true, weight: 400 })
      await openText()
    },
  },
]
