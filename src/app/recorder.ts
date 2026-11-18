import { videoFormat } from '../export/videoFormat'
import { useApp } from '../state/store'
import { studio } from './studio'

/**
 * Draw the reveal lens (the original image showing through a circle around the
 * pointer) into a canvas that covers the whole art, padding included.
 */
export function drawLens(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = useApp.getState()
  const v = studio.view
  const p = studio.pointer
  if (s.tool !== 'interact' || s.interaction.mode !== 'lens' || !p.active || !v || !s.board) return
  const l = v.layout
  const cw = w / (l.cols + 2 * l.pad)
  const ch = h / (l.rows + 2 * l.pad)
  const x = (l.pad + p.x) * cw
  const y = (l.pad + p.y) * ch
  const r = s.interaction.radius * ch * (0.8 + s.interaction.strength * 0.6)
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  const bg = studio.backgroundRGBA()
  if (bg[3]) {
    ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  ctx.drawImage(studio.composite, l.pad * cw, l.pad * ch, l.cols * cw, l.rows * ch)
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = s.motion.highlight
  ctx.lineWidth = Math.max(1.5, r * 0.025)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawPointer(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const v = studio.view
  const p = studio.pointer
  if (!v || !p.active) return
  const l = v.layout
  const x = (l.pad + p.x) * (w / (l.cols + 2 * l.pad))
  const y = (l.pad + p.y) * (h / (l.rows + 2 * l.pad))
  const r = Math.max(6, w * 0.012) * (p.down ? 1.4 : 1)
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.lineWidth = Math.max(1, r * 0.15)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

let session: {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  unhook: () => void
  ext: string
  mime: string
} | null = null

export function startRecording(showPointer: boolean): void {
  const s = useApp.getState()
  const src = studio.canvas
  if (!src || !studio.frame) {
    s.toast('Add something to the board first.', 'error')
    return
  }
  const fmt = videoFormat()
  if (!fmt || typeof src.captureStream !== 'function') {
    s.toast('Recording isn’t supported in this browser.', 'error')
    return
  }
  const k = Math.min(1, 1920 / Math.max(src.width, src.height))
  const out = document.createElement('canvas')
  out.width = Math.max(2, Math.round((src.width * k) / 2) * 2)
  out.height = Math.max(2, Math.round((src.height * k) / 2) * 2)
  const ctx = out.getContext('2d')!
  const bg = studio.backgroundRGBA(true, false)
  const paint = () => {
    const c = studio.canvas
    if (!c) return
    ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`
    ctx.fillRect(0, 0, out.width, out.height)
    // Keep the aspect if the preview is resized mid-take.
    const f = Math.min(out.width / c.width, out.height / c.height)
    const w = c.width * f
    const h = c.height * f
    const x = (out.width - w) / 2
    const y = (out.height - h) / 2
    ctx.drawImage(c, x, y, w, h)
    ctx.save()
    ctx.translate(x, y)
    drawLens(ctx, w, h)
    if (showPointer) drawPointer(ctx, w, h)
    ctx.restore()
  }
  paint()
  const stream = out.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 12_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  recorder.start(250)
  session = { recorder, stream, chunks, unhook: studio.onFrame(paint), ext: fmt.ext, mime: fmt.mime }
  useApp.setState({ recording: { startedAt: performance.now() } })
}

export async function stopRecording(): Promise<void> {
  const cur = session
  if (!cur) return
  session = null
  const started = useApp.getState().recording?.startedAt ?? performance.now()
  await new Promise<void>((resolve) => {
    cur.recorder.onstop = () => resolve()
    cur.recorder.stop()
  })
  cur.unhook()
  for (const t of cur.stream.getTracks()) t.stop()
  const blob = new Blob(cur.chunks, { type: cur.mime.split(';')[0] })
  const prev = useApp.getState().take
  if (prev) URL.revokeObjectURL(prev.url)
  useApp.setState({
    recording: null,
    take: { url: URL.createObjectURL(blob), blob, ext: cur.ext, seconds: (performance.now() - started) / 1000 },
  })
}

export function discardTake(): void {
  const t = useApp.getState().take
  if (t) URL.revokeObjectURL(t.url)
  useApp.setState({ take: null })
}
