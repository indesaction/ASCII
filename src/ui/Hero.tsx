/**
 * The welcome screen: an editorial spread with a live plate — the rose sample,
 * converted by the real engine, shimmering and pushing away from your pointer.
 */
import { useEffect, useRef, useState } from 'react'
import { addCameraLayer, pickFiles } from '../app/actions'
import { newBlankBoard } from '../app/doc'
import { loadFonts } from '../app/fonts'
import { SAMPLES, addText, roseSvg, svgToCanvas } from '../app/sources'
import { getAnimation } from '../anim/animations'
import { PointerTracker } from '../anim/interact'
import { hexToRgb } from '../engine/color'
import { LOOKS } from '../engine/presets'
import { DEFAULT_SHAPE, DEFAULT_STYLE } from '../state/store'
import { Button } from './ds'
import { I } from './icons'
import { buildMini, paintMini, type MiniArt } from './mini'

const HEADLINE = 'set in type'
const SCRAMBLE = '#%&*+=<>/\\|~^:'
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function useDecoded(text: string): string {
  const [out, setOut] = useState(text)
  useEffect(() => {
    if (reduced()) return
    let frame = 0
    const id = setInterval(() => {
      frame++
      setOut(
        [...text]
          .map((ch, i) => (ch === ' ' || frame > 8 + i * 2 ? ch : SCRAMBLE[(frame * 7 + i * 3) % SCRAMBLE.length]))
          .join(''),
      )
      if (frame > 10 + text.length * 2) clearInterval(id)
    }, 45)
    return () => clearInterval(id)
  }, [text])
  return out
}

const PASSION = LOOKS.find((l) => l.id === 'passion')!

function Plate() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [art, setArt] = useState<MiniArt | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      await loadFonts()
      const src = await svgToCanvas(roseSvg())
      if (!alive) return
      const shape = { ...DEFAULT_SHAPE, ...PASSION.shape, columns: 62 }
      const style = { ...DEFAULT_STYLE, ...PASSION.style, fontSize: 11, lineHeight: 1.0, padding: 3 }
      setArt(buildMini({ el: src, width: src.width, height: src.height }, shape, style, Math.min(2, devicePixelRatio || 1)))
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || !art) return
    const tracker = new PointerTracker()
    const anim = getAnimation(PASSION.motion?.animation ?? 'glitter')
    const hl = hexToRgb(PASSION.motion?.highlight ?? '#ffd1dc')
    const L = art.layout
    const toCell = (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      return [((e.clientX - r.left) / r.width) * (L.cols + 2 * L.pad) - L.pad, ((e.clientY - r.top) / r.height) * (L.rows + 2 * L.pad) - L.pad]
    }
    const t0 = performance.now()
    const still = reduced()
    let raf = 0
    let visible = true
    const draw = () => {
      raf = 0
      const now = (performance.now() - t0) / 1000
      const interaction = tracker.state(now, { mode: 'repel', strength: 0.7, radius: 9 }, L.cols, L.rows)
      paintMini(c, art, now, still ? {} : { animation: anim.id, duration: anim.duration, intensity: 0.75, highlight: hl, interaction })
      if (!still && visible) raf = requestAnimationFrame(draw)
    }
    const move = (e: PointerEvent) => {
      const [x, y] = toCell(e)
      tracker.move(x, y, (performance.now() - t0) / 1000)
      if (still && !raf) raf = requestAnimationFrame(draw)
    }
    const down = (e: PointerEvent) => {
      const [x, y] = toCell(e)
      tracker.press(x, y, (performance.now() - t0) / 1000)
    }
    const up = () => tracker.release()
    const leave = () => tracker.leave()
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointerleave', leave)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && document.visibilityState === 'visible'
      if (visible && !raf) raf = requestAnimationFrame(draw)
    })
    io.observe(c)
    draw()
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointerleave', leave)
    }
  }, [art])

  const L = art?.layout
  return (
    <figure className="hero-plate">
      <div className="hero-frame" style={L ? { aspectRatio: `${(L.cols + 2 * L.pad) * L.cellW} / ${(L.rows + 2 * L.pad) * L.cellH}` } : undefined}>
        <canvas ref={ref} role="img" aria-label="A rose drawn in pink ASCII glyphs that shimmer and move away from your pointer" />
      </div>
      <figcaption>
        <span className="t-caption">Pl. I — Rose</span>
        <span className="t-meta">{art ? `${art.glyphs.toLocaleString()} glyphs · live · touch it` : 'setting type…'}</span>
      </figcaption>
    </figure>
  )
}

export function Hero() {
  const decoded = useDecoded(HEADLINE)
  return (
    <div className="hero">
      <div className="hero-copy">
        <p className="t-label">Photo · Video · PDF · Vector · Camera · Type</p>
        <h1 className="t-display">
          Every image,
          <br />
          <em>
            {decoded}
            <span className="accent-dot">.</span>
          </em>
        </h1>
        <p className="lede">Layer photos, video and drawings on one board. Every pixel turns into living type you can touch, animate, record and print in CMYK.</p>
        <div className="hero-actions">
          <Button variant="primary" icon={<I.Upload />} onClick={() => pickFiles()}>
            Add files
          </Button>
          <Button variant="secondary" icon={<I.Brush />} onClick={() => newBlankBoard(1)}>
            Start drawing
          </Button>
          <Button variant="ghost" icon={<I.Camera />} onClick={() => void addCameraLayer()}>
            Camera
          </Button>
          <Button variant="ghost" icon={<I.Text />} onClick={() => void addText('top')}>
            Write
          </Button>
        </div>
        <div className="hero-samples">
          <span className="t-meta">or open a sample —</span>
          {SAMPLES.map((s) => (
            <button key={s.id} type="button" className="link" onClick={() => void s.load()}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <Plate />
      <p className="hero-formats t-meta">JPG PNG WEBP GIF · MP4 WEBM MOV · PDF AI EPS SVG · TIFF PSD · TXT ANSI — everything stays on your device</p>
    </div>
  )
}
