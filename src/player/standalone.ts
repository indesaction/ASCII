/**
 * Standalone player bundled into exported "web embed" HTML files.
 * Built separately as an IIFE (see vite.player.config.ts).
 */
import { prepareFrame } from '../anim/animations'
import { blendFor, composeFrame } from '../anim/compose'
import { hexToRgb } from '../engine/color'
import { FONT_ADVANCE, FONT_FAMILY, toCodepoints } from '../engine/glyphs'
import type { AsciiFrame } from '../engine/types'
import { RenderList, createRenderer, fitPixelRatio, type Layout, type RGBA } from '../render'
import { b64ToBytes } from '../util/base64'
import type { PlayerData } from './types'

async function main(): Promise<void> {
  const el = document.getElementById('ascii-data')
  if (!el?.textContent) return
  const d = JSON.parse(el.textContent) as PlayerData
  if (d.font && typeof FontFace !== 'undefined') {
    try {
      const ff = new FontFace(FONT_FAMILY, `url(data:font/woff;base64,${d.font}) format('woff')`, {
        weight: String(d.style.weight),
      })
      await ff.load()
      document.fonts.add(ff)
    } catch {
      /* fall back to system monospace */
    }
  }
  const inkBytes = b64ToBytes(d.ink)
  const frame: AsciiFrame = {
    cols: d.cols,
    rows: d.rows,
    chars: Uint32Array.from(toCodepoints(d.chars)),
    fg: b64ToBytes(d.fg),
    bg: d.bg ? b64ToBytes(d.bg) : null,
    ink: Float32Array.from(inkBytes, (v) => v / 255),
  }
  const prep = prepareFrame(frame, toCodepoints(d.ramp), toCodepoints(d.pool))
  const host = document.getElementById('ascii-root') ?? document.body
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.touchAction = d.motion.magnet ? 'none' : 'auto'
  host.appendChild(canvas)
  const renderer = createRenderer(canvas)
  const st = d.style
  const cellW = Math.max(st.fontSize * 0.2, st.fontSize * FONT_ADVANCE + st.letterSpacing)
  const cellH = Math.max(st.fontSize * 0.3, st.fontSize * st.lineHeight)
  const layout: Layout = {
    cols: d.cols,
    rows: d.rows,
    cellW,
    cellH,
    fontSize: st.fontSize,
    weight: st.weight,
    pad: st.padding,
    pixelRatio: 1,
  }
  const artW = (d.cols + 2 * st.padding) * cellW
  const artH = (d.rows + 2 * st.padding) * cellH
  const bgRgb = hexToRgb(st.background)
  const bg: RGBA = st.transparent ? [0, 0, 0, 0] : [bgRgb[0], bgRgb[1], bgRgb[2], 255]
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const animated = d.motion.animation !== 'none' && !reduce
  const list = new RenderList()
  const pointer = { x: 0, y: 0, active: false }
  let dirty = true

  const fit = () => {
    const r = host.getBoundingClientRect()
    const w = r.width || window.innerWidth
    const h = host === document.body ? window.innerHeight : r.height || artH
    const zoom = Math.max(0.05, Math.min(w / artW, h / artH))
    canvas.style.width = `${artW * zoom}px`
    canvas.style.height = `${artH * zoom}px`
    layout.pixelRatio = fitPixelRatio(layout, zoom * Math.min(3, devicePixelRatio || 1), 8192, 24_000_000)
    renderer.setLayout(layout)
    dirty = true
  }
  new ResizeObserver(fit).observe(host)
  window.addEventListener('resize', fit)
  fit()

  if (d.motion.magnet) {
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      pointer.x = ((e.clientX - r.left) / r.width) * (d.cols + 2 * st.padding) - st.padding
      pointer.y = ((e.clientY - r.top) / r.height) * (d.rows + 2 * st.padding) - st.padding
      pointer.active = true
      dirty = true
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerdown', move)
    canvas.addEventListener('pointerleave', () => {
      pointer.active = false
      dirty = true
    })
  }

  const params = {
    animation: d.motion.animation,
    intensity: d.motion.intensity,
    duration: d.motion.duration,
    highlight: hexToRgb(d.motion.highlight),
    background: bgRgb,
    aspect: cellW / cellH,
    still: !animated,
  }
  let time = 0
  let last = 0
  const tick = (now: number) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    if (animated) {
      time += dt * d.motion.speed
      dirty = true
    }
    if (dirty) {
      dirty = false
      composeFrame(list, frame, prep, time, {
        ...params,
        magnet: pointer.active ? { x: pointer.x, y: pointer.y, strength: 0.4 + d.motion.intensity * 0.6 } : null,
      })
      renderer.render(list, bg, blendFor(params.animation, params.still))
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

void main()
