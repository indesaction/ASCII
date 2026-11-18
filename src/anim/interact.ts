import type { InteractionMode, InteractionSettings, RGB } from '../engine/types'
import { GEOM_STRIDE, type RenderList } from '../render/list'
import { hash } from './animations'

export interface InteractionState {
  mode: InteractionMode
  strength: number
  radius: number
  /** Pointer position in cells. */
  x: number
  y: number
  active: boolean
  down: boolean
  /** Taps / drag drops with their age in seconds (ripples, bursts). */
  taps: { x: number; y: number; age: number }[]
  /** Recent pointer path with ages (trail). */
  trail: { x: number; y: number; age: number }[]
  /** Smoothed 3D tilt angles, radians. */
  tiltX: number
  tiltY: number
}

const TAP_LIFE = 2.6
const TRAIL_LIFE = 0.9

/** Collects pointer activity (in cell coordinates) and turns it into an interaction state. */
export class PointerTracker {
  x = 0
  y = 0
  active = false
  down = false
  private taps: { x: number; y: number; t: number }[] = []
  private trail: { x: number; y: number; t: number }[] = []
  private lastDrop = 0
  private tiltX = 0
  private tiltY = 0

  move(x: number, y: number, now: number): void {
    this.x = x
    this.y = y
    this.active = true
    const last = this.trail[this.trail.length - 1]
    if (!last || Math.hypot(x - last.x, y - last.y) > 0.5 || now - last.t > 0.06) this.trail.push({ x, y, t: now })
    if (this.trail.length > 28) this.trail.shift()
    if (this.down && now - this.lastDrop > 0.16) {
      this.taps.push({ x, y, t: now })
      this.lastDrop = now
    }
    if (this.taps.length > 24) this.taps.shift()
  }

  press(x: number, y: number, now: number): void {
    this.down = true
    this.taps.push({ x, y, t: now })
    this.lastDrop = now
    this.move(x, y, now)
  }

  release(): void {
    this.down = false
  }

  leave(): void {
    this.active = false
    this.down = false
  }

  /** True while anything is still moving (keeps the render loop alive). */
  busy(now: number): boolean {
    if (this.active) return true
    if (Math.abs(this.tiltX) > 1e-3 || Math.abs(this.tiltY) > 1e-3) return true
    const t = this.taps[this.taps.length - 1]
    const p = this.trail[this.trail.length - 1]
    return (!!t && now - t.t < TAP_LIFE) || (!!p && now - p.t < TRAIL_LIFE)
  }

  state(now: number, s: InteractionSettings, cols: number, rows: number): InteractionState {
    this.taps = this.taps.filter((t) => now - t.t < TAP_LIFE)
    this.trail = this.trail.filter((t) => now - t.t < TRAIL_LIFE)
    const maxA = 0.75 * s.strength
    const tx = this.active ? -(this.y / Math.max(1, rows) - 0.5) * maxA : 0
    const ty = this.active ? (this.x / Math.max(1, cols) - 0.5) * maxA : 0
    this.tiltX += (tx - this.tiltX) * 0.14
    this.tiltY += (ty - this.tiltY) * 0.14
    return {
      mode: s.mode,
      strength: s.strength,
      radius: s.radius,
      x: this.x,
      y: this.y,
      active: this.active,
      down: this.down,
      taps: this.taps.map((t) => ({ x: t.x, y: t.y, age: now - t.t })),
      trail: this.trail.map((t) => ({ x: t.x, y: t.y, age: now - t.t })),
      tiltX: this.tiltX,
      tiltY: this.tiltY,
    }
  }
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t

function tint(col: Uint8Array, c: number, to: RGB, t: number): void {
  if (t <= 0) return
  if (t > 1) t = 1
  col[c] = mix(col[c], to[0], t)
  col[c + 1] = mix(col[c + 1], to[1], t)
  col[c + 2] = mix(col[c + 2], to[2], t)
}

const WHITE: RGB = [255, 255, 255]

/** Post-process an animation's render list with the pointer interaction. */
export function applyInteraction(
  list: RenderList,
  st: InteractionState,
  aspect: number,
  hl: RGB,
  cols: number,
  rows: number,
): void {
  if (st.mode === 'off' || st.mode === 'lens') return
  const g = list.geom
  const col = list.color
  const R = Math.max(1, st.radius)
  const k = st.strength
  const start = list.bgCount

  if (st.mode === 'tilt') {
    const ax = st.tiltX
    const ay = st.tiltY
    if (Math.abs(ax) < 1e-4 && Math.abs(ay) < 1e-4) return
    const cx = cols / 2
    const cy = rows / 2
    const F = Math.max(cols * aspect, rows) * 1.5
    const cX = Math.cos(ax)
    const sX = Math.sin(ax)
    const cY = Math.cos(ay)
    const sY = Math.sin(ay)
    for (let i = start; i < list.count; i++) {
      const o = i * GEOM_STRIDE
      const vx = (g[o] + 0.5 - cx) * aspect
      const vy = g[o + 1] + 0.5 - cy
      const x1 = vx * cY
      const z1 = -vx * sY
      const y2 = vy * cX - z1 * sX
      const z2 = vy * sX + z1 * cX
      const f = F / (F + z2)
      g[o] = (x1 * f) / aspect + cx - 0.5
      g[o + 1] = y2 * f + cy - 0.5
      g[o + 2] *= f
      // A soft sheen where the surface faces the light.
      const sheen = Math.max(0, 1 - Math.abs(vx * sY * 0.6 - vy * sX * 0.6 + (vx + vy) * 0.02) / (R * 1.2))
      tint(col, i * 4, WHITE, sheen * 0.35 * k)
    }
    return
  }

  if (st.mode === 'ripple' || st.mode === 'burst') {
    if (st.taps.length === 0) return
    for (let i = start; i < list.count; i++) {
      const o = i * GEOM_STRIDE
      let ox = 0
      let oy = 0
      let glow = 0
      let grow = 0
      let spin = 0
      for (const tp of st.taps) {
        const dx = (g[o] + 0.5 - tp.x) * aspect
        const dy = g[o + 1] + 0.5 - tp.y
        const d = Math.hypot(dx, dy) || 1e-4
        if (st.mode === 'ripple') {
          const ring = tp.age * 20
          const delta = d - ring
          if (delta < -6 || delta > 6) continue
          const amp = (1 - tp.age / TAP_LIFE) * k * 1.5
          const env = Math.exp(-(delta * delta) / 7)
          const wave = Math.sin(delta * 1.3) * amp * env
          ox += (dx / d) * wave
          oy += (dy / d) * wave
          glow = Math.max(glow, env * amp * 0.6)
          grow += env * amp * 0.25
        } else {
          const reach = R * 1.6
          if (d > reach) continue
          const f = 1 - d / reach
          const t = tp.age
          const env = (Math.exp(-3 * t) - Math.exp(-11 * t)) * 2.4
          const push = f * R * 1.3 * k * env
          ox += (dx / d) * push
          oy += (dy / d) * push
          spin += f * (hash(i * 7 + 3) - 0.5) * 7 * env * k
          grow += f * env * 0.8
          glow = Math.max(glow, f * env)
        }
      }
      if (ox === 0 && oy === 0 && glow === 0) continue
      g[o] += ox / aspect
      g[o + 1] += oy
      g[o + 2] *= 1 + grow
      g[o + 3] += spin
      tint(col, i * 4, hl, glow)
    }
    return
  }

  if (st.mode === 'trail') {
    if (st.trail.length === 0) return
    const r = R * 0.7
    for (let i = start; i < list.count; i++) {
      const o = i * GEOM_STRIDE
      let best = 0
      for (const p of st.trail) {
        const dx = (g[o] + 0.5 - p.x) * aspect
        const dy = g[o + 1] + 0.5 - p.y
        const d2 = dx * dx + dy * dy
        if (d2 > r * r) continue
        const f = (1 - Math.sqrt(d2) / r) * (1 - p.age / TRAIL_LIFE)
        if (f > best) best = f
      }
      if (best <= 0) continue
      g[o + 2] *= 1 + best * 0.9 * k
      g[o + 3] += (hash(i * 13 + 1) - 0.5) * best * 2 * k
      g[o + 1] -= best * 0.6 * k
      tint(col, i * 4, hl, best * 0.95)
      if (best > 0.6) tint(col, i * 4, WHITE, (best - 0.6) * 1.5)
    }
    return
  }

  if (!st.active) return
  const px = st.x
  const py = st.y
  const pressBoost = st.down ? 1.5 : 1
  for (let i = start; i < list.count; i++) {
    const o = i * GEOM_STRIDE
    const dx = (g[o] + 0.5 - px) * aspect
    const dy = g[o + 1] + 0.5 - py
    const d = Math.hypot(dx, dy)
    const c = i * 4
    switch (st.mode) {
      case 'repel': {
        if (d >= R || d < 1e-4) break
        const f = 1 - d / R
        const push = f * f * R * 0.55 * k * pressBoost
        g[o] += ((dx / d) * push) / aspect
        g[o + 1] += (dy / d) * push
        g[o + 2] *= 1 + f * 0.6 * k
        tint(col, c, hl, f * 0.7 * k)
        break
      }
      case 'attract': {
        const reach = R * 1.6
        if (d >= reach) break
        const f = 1 - d / reach
        const pull = f * f * 0.6 * k * pressBoost
        g[o] -= (dx * Math.min(0.92, pull)) / aspect
        g[o + 1] -= dy * Math.min(0.92, pull)
        g[o + 2] *= 1 + f * 0.5 * k
        tint(col, c, hl, f * 0.6 * k)
        break
      }
      case 'swirl': {
        const reach = R * 1.5
        if (d >= reach) break
        const f = 1 - d / reach
        const a = f * f * Math.PI * 1.3 * k * pressBoost
        const cs = Math.cos(a)
        const sn = Math.sin(a)
        g[o] = (dx * cs - dy * sn) / aspect + px - 0.5
        g[o + 1] = dx * sn + dy * cs + py - 0.5
        g[o + 3] += a
        tint(col, c, hl, f * 0.5 * k)
        break
      }
      case 'spotlight': {
        const f = Math.max(0, 1 - d / (R * 1.4))
        const s = f * f * (3 - 2 * f)
        const dim = 1 - 0.85 * k
        col[c + 3] = col[c + 3] * (dim + (1 - dim) * s)
        g[o + 2] *= 1 + s * 0.3 * k
        tint(col, c, WHITE, s * s * 0.45 * k)
        break
      }
    }
  }
}
