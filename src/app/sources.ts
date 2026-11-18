import { FONT_STACK } from '../engine/glyphs'
import { useApp, type LayerMeta, type TextSettings } from '../state/store'
import { addLayer, newBlankBoard, updateLayer, type Placement } from './doc'
import { history } from './history'
import { decodeEps, decodeGif, decodePsd, decodeTiff, openPdf, parseAsciiText } from './importers'
import { disposeRuntime, makeCanvas, runtimes, type LayerRuntime } from './runtime'
import { studio } from './studio'

const MAX_SIDE = 2048

function toast(text: string, tone: 'info' | 'error' | 'success' = 'info') {
  useApp.getState().toast(text, tone)
}

function canvasFrom(el: CanvasImageSource, w: number, h: number, max = MAX_SIDE): HTMLCanvasElement {
  const s = Math.min(1, max / Math.max(w, h))
  const c = makeCanvas(w * s, h * s)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(el, 0, 0, c.width, c.height)
  return c
}

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('This image could not be decoded.'))
    img.src = url
  })
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'Untitled'
}

function stillRuntime(c: HTMLCanvasElement): LayerRuntime {
  return { el: c, width: c.width, height: c.height, version: 0 }
}

export function addCanvasLayer(c: HTMLCanvasElement, name: string, where: Placement = 'above', extra?: Partial<LayerMeta>): string {
  return addLayer(stillRuntime(c), { kind: 'image', name, extra }, where)
}

export async function addImage(blob: Blob, name: string, where: Placement = 'above'): Promise<void> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImageEl(url)
    addCanvasLayer(canvasFrom(img, img.naturalWidth, img.naturalHeight), baseName(name), where)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Rasterize SVG markup at high resolution (vector → crisp bitmap → ASCII). */
export async function svgToCanvas(text: string): Promise<HTMLCanvasElement> {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('This SVG could not be read.')
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
  const s = MAX_SIDE / Math.max(w, h)
  const W = Math.round(w * s)
  const H = Math.round(h * s)
  svg.setAttribute('width', String(W))
  svg.setAttribute('height', String(H))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
  try {
    const img = await loadImageEl(url)
    const c = makeCanvas(W, H)
    c.getContext('2d')!.drawImage(img, 0, 0, W, H)
    return c
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
  Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' })
  document.body.appendChild(v)
  return v
}

function whenReady(v: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (v.readyState >= 2 && v.videoWidth) return resolve()
    v.onloadeddata = () => resolve()
    v.onerror = () => reject(new Error('This video could not be played in this browser.'))
  })
}

export async function addVideo(file: File, where: Placement = 'above'): Promise<void> {
  const v = hiddenVideo()
  v.src = URL.createObjectURL(file)
  await whenReady(v)
  await v.play().catch(() => undefined)
  addLayer(
    { el: v, video: v, width: v.videoWidth, height: v.videoHeight, version: 0 },
    { kind: 'video', name: baseName(file.name), extra: { playing: true, loop: true, rate: 1 } },
    where,
  )
}

async function cameraStream(facing: 'user' | 'environment'): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('The camera isn’t available here. Add a photo or video instead.')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
  } catch (err) {
    const name = (err as Error).name
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('Camera access is blocked. Allow it in your browser, or add a photo or video instead.')
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new Error('No camera was found on this device.')
    throw err
  }
}

export async function addCamera(facing: 'user' | 'environment' = 'user', where: Placement = 'above'): Promise<void> {
  const stream = await cameraStream(facing)
  const v = hiddenVideo()
  v.srcObject = stream
  await whenReady(v)
  await v.play().catch(() => undefined)
  addLayer(
    { el: v, video: v, stream, mirror: facing === 'user', width: v.videoWidth, height: v.videoHeight, version: 0 },
    { kind: 'camera', name: 'Camera', extra: { playing: true } },
    where,
  )
}

export async function flipCamera(id: string): Promise<void> {
  const rt = runtimes.get(id)
  if (!rt?.video || !rt.stream) return
  const facing = rt.mirror ? 'environment' : 'user'
  const stream = await cameraStream(facing)
  for (const t of rt.stream.getTracks()) t.stop()
  rt.video.srcObject = stream
  rt.stream = stream
  rt.mirror = facing === 'user'
  await rt.video.play().catch(() => undefined)
  studio.invalidate('composite')
}

/** Turn a live camera or video layer into a still image of the current frame. */
export function freezeLayer(id: string): void {
  const rt = runtimes.get(id)
  if (!rt?.video) return
  const c = makeCanvas(rt.width, rt.height)
  const ctx = c.getContext('2d')!
  if (rt.mirror) ctx.setTransform(-1, 0, 0, 1, c.width, 0)
  ctx.drawImage(rt.video, 0, 0, c.width, c.height)
  disposeRuntime(rt)
  runtimes.set(id, { el: c, width: rt.width, height: rt.height, mask: rt.mask, version: rt.version + 1 })
  const l = useApp.getState().layers.find((x) => x.id === id)
  updateLayer(id, { kind: 'image', name: `${l?.name ?? 'Frame'} still`, playing: undefined }, false)
  history.clear()
  toast('Frozen into a still image', 'success')
}

export function setVideo(id: string, patch: { playing?: boolean; rate?: number; loop?: boolean }): void {
  const rt = runtimes.get(id)
  if (rt?.video && !rt.stream) {
    if (patch.rate !== undefined) rt.video.playbackRate = patch.rate
    if (patch.loop !== undefined) rt.video.loop = patch.loop
    if (patch.playing === true) void rt.video.play()
    if (patch.playing === false) rt.video.pause()
  }
  updateLayer(id, patch, false)
  studio.invalidate('composite')
}

export function seekVideo(id: string, fraction: number): void {
  const v = runtimes.get(id)?.video
  if (!v || !isFinite(v.duration)) return
  v.currentTime = Math.max(0, Math.min(v.duration - 0.01, fraction * v.duration))
  studio.invalidate('composite')
}

// ---------------------------------------------------------------------------
// Text layers
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
  const c = makeCanvas(Math.max(...widths) + pad * 2, lines.length * lh + pad * 1.4)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = t.fill === 'ink' ? '#ffffff' : t.color
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  lines.forEach((l, i) => ctx.fillText(l, c.width / 2, pad * 0.7 + (i + 0.8) * lh))
  return c
}

export async function addText(where: Placement = 'above', settings?: Partial<TextSettings>): Promise<string> {
  const t = { ...useApp.getState().text, ...settings }
  const c = await renderText(t)
  const s = useApp.getState()
  const board = s.board
  // Text arrives at a comfortable size rather than filling the board.
  const extra: Partial<LayerMeta> = { text: t }
  if (board) extra.scale = Math.min(board.width / c.width, board.height / c.height) * (s.layers.length ? 0.7 : 1)
  return addLayer(stillRuntime(c), { kind: 'text', name: t.text.split('\n')[0] || 'Text', extra }, where)
}

/** Re-render a text layer after its words or style change. */
export async function updateText(id: string, patch: Partial<TextSettings>): Promise<void> {
  const l = useApp.getState().layers.find((x) => x.id === id)
  const rt = runtimes.get(id)
  if (!l?.text || !rt) return
  const t = { ...l.text, ...patch }
  const c = await renderText(t)
  rt.el = c
  rt.width = c.width
  rt.height = c.height
  rt.mask = undefined
  rt.version++
  updateLayer(id, { text: t, width: c.width, height: c.height, name: t.text.split('\n')[0] || 'Text' }, false)
  useApp.getState().setText(patch)
}

// ---------------------------------------------------------------------------
// PDF pages
// ---------------------------------------------------------------------------

export async function setPdfPage(id: string, page: number): Promise<void> {
  const rt = runtimes.get(id)
  if (!rt?.pdf) return
  const c = await rt.pdf.render(page)
  rt.el = c
  rt.width = c.width
  rt.height = c.height
  rt.mask = undefined
  rt.version++
  updateLayer(id, { page, width: c.width, height: c.height }, false)
}

// ---------------------------------------------------------------------------
// ASCII text import → glyph layer
// ---------------------------------------------------------------------------

export function importAscii(text: string, name: string): void {
  const { cells, cols, rows } = parseAsciiText(text)
  if (!cells.length) throw new Error('This text file has no characters to place.')
  const s = useApp.getState()
  if (!s.board) {
    // Size the board so the grid matches the text exactly.
    s.setShape({ columns: cols })
    const fs = s.style.fontSize
    newBlankBoard((cols * (fs * 0.6 + s.style.letterSpacing)) / (rows * fs * s.style.lineHeight))
    useApp.setState({ title: baseName(name) })
    s.setTool('interact')
  }
  studio.edits.begin()
  for (const c of cells) {
    const [r, g, b] = c.rgb ?? [0, 0, 0]
    studio.edits.set(c.x, c.y, { ch: c.ch, r, g, b, a: c.rgb ? 255 : -1 })
  }
  if (studio.edits.end()) history.push({ label: 'Import text art', undo: () => glyphUndo(), redo: () => glyphRedo() })
  studio.applyEdits()
  studio.syncEdits()
  toast(`Placed ${cells.length.toLocaleString()} characters on the glyph layer`, 'success')
}

export function glyphUndo(): void {
  studio.edits.undo()
  studio.applyEdits()
  studio.syncEdits()
}

export function glyphRedo(): void {
  studio.edits.redo()
  studio.applyEdits()
  studio.syncEdits()
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const ACCEPT =
  'image/*,video/*,.svg,.pdf,.ai,.eps,.ps,.tif,.tiff,.psd,.gif,.txt,.ans,.asc,.json,application/pdf,application/json,text/plain'

export async function addFile(file: File, where: Placement = 'above'): Promise<void> {
  const type = file.type
  const lower = file.name.toLowerCase()
  const ext = lower.split('.').pop() ?? ''
  const name = baseName(file.name)
  const busy = (label: string) => useApp.setState({ busy: { label, progress: -1 } })
  try {
    if (ext === 'json' || type === 'application/json') {
      const { importProject } = await import('../export/project')
      await importProject(await file.text())
      return
    }
    if (ext === 'svg' || type === 'image/svg+xml') {
      addCanvasLayer(await svgToCanvas(await file.text()), name, where)
    } else if (ext === 'pdf' || ext === 'ai' || type === 'application/pdf') {
      busy('Opening PDF')
      const pdf = await openPdf(await file.arrayBuffer())
      const c = await pdf.render(1)
      addLayer({ ...stillRuntime(c), pdf }, { kind: 'pdf', name, extra: { page: 1, pages: pdf.pages } }, where)
      if (pdf.pages > 1) toast(`Page 1 of ${pdf.pages}. Change pages in the layer settings.`)
    } else if (ext === 'eps' || ext === 'ps' || type === 'application/postscript') {
      addCanvasLayer(await decodeEps(await file.arrayBuffer()), name, where)
    } else if (ext === 'tif' || ext === 'tiff' || type === 'image/tiff') {
      busy('Decoding TIFF')
      addCanvasLayer(await decodeTiff(await file.arrayBuffer()), name, where)
    } else if (ext === 'psd' || type === 'image/vnd.adobe.photoshop') {
      busy('Reading PSD')
      addCanvasLayer(await decodePsd(await file.arrayBuffer()), name, where)
    } else if (ext === 'gif' || type === 'image/gif') {
      const gif = await decodeGif(await file.arrayBuffer())
      if (gif.frames.length === 1) addCanvasLayer(gif.frames[0], name, where)
      else {
        const f0 = gif.frames[0]
        addLayer({ el: f0, gif, width: f0.width, height: f0.height, version: 0 }, { kind: 'gif', name, extra: { playing: true, rate: 1 } }, where)
      }
    } else if (ext === 'txt' || ext === 'ans' || ext === 'asc' || type === 'text/plain') {
      importAscii(await file.text(), file.name)
    } else if (type.startsWith('video/') || /^(mp4|webm|mov|m4v|ogv)$/.test(ext)) {
      busy('Loading video')
      await addVideo(file, where)
    } else if (type.startsWith('image/') || /^(png|jpe?g|webp|avif|bmp|ico|heic|heif)$/.test(ext)) {
      await addImage(file, file.name, where)
    } else {
      throw new Error(`“${file.name}” isn’t a format ASCII Atelier can open.`)
    }
  } catch (err) {
    const msg = (err as Error).message || 'This file could not be opened.'
    toast(/decode/i.test(msg) && /heic|heif/.test(ext) ? 'HEIC photos open in Safari. Elsewhere, export the photo as JPG first.' : msg, 'error')
  } finally {
    useApp.setState({ busy: null })
  }
}

export async function addFiles(files: FileList | File[], where: Placement = 'above'): Promise<void> {
  for (const f of Array.from(files)) await addFile(f, where)
}

// ---------------------------------------------------------------------------
// Samples (generated procedurally, no bundled photos)
// ---------------------------------------------------------------------------

function sampleOrb(): HTMLCanvasElement {
  const S = 1000
  const c = makeCanvas(S, S)
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
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#0c0a12'
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'lighter'
  const blobs: [number, number, number, string][] = [
    [0.3, 0.4, 0.42, '#ff4a1c'],
    [0.62, 0.35, 0.38, '#2340ff'],
    [0.5, 0.7, 0.36, '#d6204f'],
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
  return c
}

export function bloomSvg(): string {
  const petals = Array.from(
    { length: 12 },
    (_, i) => `<ellipse cx="0" cy="-50" rx="15" ry="42" fill="url(#p)" opacity="0.92" transform="rotate(${i * 30})"/>`,
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

/** A crimson rose built from spiralling petal rings. */
export function roseSvg(): string {
  const rings: string[] = []
  for (let k = 7; k >= 0; k--) {
    const n = 5 + Math.floor(k / 2)
    const r = 10 + k * 10.5
    const tone = k / 7
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360 + k * 23
      const rx = r * 0.62
      const ry = r * 0.42
      rings.push(
        `<path d="M0 0 C ${-rx} ${-ry * 0.2}, ${-rx * 0.8} ${-r - ry * 0.6}, 0 ${-r - ry * 0.35} C ${rx * 0.8} ${-r - ry * 0.6}, ${rx} ${-ry * 0.2}, 0 0Z" fill="url(#g${k % 3})" stroke="#2a0510" stroke-width="${1.2 - tone * 0.4}" stroke-opacity="${0.55 - tone * 0.2}" transform="rotate(${a.toFixed(1)})"/>`,
      )
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -110 220 230">
<defs>
<radialGradient id="g0" cx="0.5" cy="0.9" r="0.9"><stop offset="0" stop-color="#3a0614"/><stop offset="0.6" stop-color="#a5103a"/><stop offset="1" stop-color="#ff5c7f"/></radialGradient>
<radialGradient id="g1" cx="0.5" cy="0.9" r="0.9"><stop offset="0" stop-color="#4a0818"/><stop offset="0.65" stop-color="#d6204f"/><stop offset="1" stop-color="#ffb3c4"/></radialGradient>
<radialGradient id="g2" cx="0.5" cy="0.9" r="0.9"><stop offset="0" stop-color="#2a0510"/><stop offset="0.6" stop-color="#8f0b2f"/><stop offset="1" stop-color="#ff7d98"/></radialGradient>
</defs>
<path d="M-6 96 C -40 70, -80 82, -98 104 C -70 112, -36 108, -6 96Z" fill="#3b0a17"/>
<path d="M6 92 C 44 64, 86 74, 104 96 C 74 106, 38 104, 6 92Z" fill="#4d0d1d"/>
${rings.join('')}
<circle r="7" fill="#2a0510"/>
</svg>`
}

export interface Sample {
  id: string
  name: string
  kind: string
  load(): Promise<void>
}

export const SAMPLES: Sample[] = [
  {
    id: 'rose',
    name: 'Rose',
    kind: 'Vector',
    load: async () => {
      const first = !useApp.getState().board
      addCanvasLayer(await svgToCanvas(roseSvg()), 'Rose')
      // On an empty board the rose arrives dressed in the Passion look.
      if (first) {
        const { LOOKS } = await import('../engine/presets')
        const look = LOOKS.find((l) => l.id === 'passion')!
        const s = useApp.getState()
        s.setShape(look.shape!)
        s.setStyle({ cellTint: 0, ...look.style })
        s.setMotion({ ...look.motion, duration: 4, playing: true })
      }
    },
  },
  { id: 'orb', name: 'Orb', kind: 'Raster', load: async () => void addCanvasLayer(sampleOrb(), 'Orb') },
  { id: 'bloom', name: 'Bloom', kind: 'Vector', load: async () => void addCanvasLayer(await svgToCanvas(bloomSvg()), 'Bloom') },
  { id: 'aura', name: 'Aura', kind: 'Gradient', load: async () => void addCanvasLayer(sampleAura(), 'Aura') },
  { id: 'type', name: 'Type', kind: 'Text', load: async () => void (await addText('above', { text: 'Atelier', font: 'display', italic: true, weight: 400 })) },
]

