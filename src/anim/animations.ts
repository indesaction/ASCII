import { hslToRgb } from '../engine/color'
import { FULL_BLOCK } from '../engine/glyphs'
import type { AsciiFrame, RGB } from '../engine/types'
import { isBlank } from '../engine/types'
import { type Blend, type RenderList, glyphs } from '../render/list'

export interface AnimCtx {
  f: AsciiFrame
  /** Glyph index per cell. */
  gi: Uint16Array
  blank: Uint8Array
  out: RenderList
  /** Loop phase 0..1 (seamless). */
  p: number
  /** Continuous time in seconds (speed-scaled). */
  time: number
  intensity: number
  hl: RGB
  bg: RGB
  /** Glyph indices for random/scrambled glyphs. */
  pool: Uint16Array
  /** Tone ramp glyph indices, light → dense. */
  ramp: Uint16Array
  /** Position of each cell's glyph in the ramp (-1 if not in ramp). */
  rampPos: Int16Array
  /** Cell width / cell height. */
  aspect: number
}

export interface AnimDef {
  id: string
  name: string
  hint: string
  /** Default loop length in seconds. */
  duration: number
  blend?: Blend
  run(c: AnimCtx): void
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function hash(n: number): number {
  n |= 0
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  n ^= n >>> 16
  return (n >>> 0) / 4294967296
}

export function hash2(a: number, b: number): number {
  return hash(Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263))
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
const easeInExpo = (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10))
const TAU = Math.PI * 2

function pick(pool: Uint16Array, r: number): number {
  return pool[Math.floor(r * pool.length) % pool.length]
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Background tiles (cell tint / pixel-mode lower halves). Always first in the list. */
export function emitBg(c: AnimCtx, alphaMul = 1): void {
  const { f, out } = c
  const bg = f.bg
  if (bg) {
    const full = glyphs.index(FULL_BLOCK)
    for (let y = 0, i = 0; y < f.rows; y++) {
      for (let x = 0; x < f.cols; x++, i++) {
        const o = i * 4
        if (bg[o + 3] > 0) out.push(x, y, full, 1, 0, bg[o], bg[o + 1], bg[o + 2], bg[o + 3] * alphaMul)
      }
    }
  }
  out.bgCount = out.count
}

export function emitStatic(c: AnimCtx): void {
  emitBg(c)
  const { f, out, gi, blank } = c
  const fg = f.fg
  for (let y = 0, i = 0; y < f.rows; y++) {
    for (let x = 0; x < f.cols; x++, i++) {
      if (blank[i]) continue
      const o = i * 4
      out.push(x, y, gi[i], 1, 0, fg[o], fg[o + 1], fg[o + 2], fg[o + 3])
    }
  }
}

// Smooth value noise (0..1) for organic effects.
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x: number, y: number): number {
  return vnoise(x, y) * 0.62 + vnoise(x * 2.3 + 7.1, y * 2.3 + 3.7) * 0.38
}

interface Shards {
  id: Int16Array
  cx: Float32Array
  cy: Float32Array
  border: Uint8Array
}

const shardCache = new WeakMap<AsciiFrame, Shards>()

/** Voronoi shards over the grid (cached per frame). */
function shardsFor(f: AsciiFrame, aspect: number): Shards {
  const hit = shardCache.get(f)
  if (hit) return hit
  const n = f.cols * f.rows
  const N = Math.max(12, Math.min(48, Math.round(n / 260)))
  const sx = new Float32Array(N)
  const sy = new Float32Array(N)
  for (let k = 0; k < N; k++) {
    sx[k] = hash(k * 2 + 11) * f.cols
    sy[k] = hash(k * 2 + 12) * f.rows
  }
  const id = new Int16Array(n)
  const cx = new Float32Array(N)
  const cy = new Float32Array(N)
  const cnt = new Float32Array(N)
  for (let y = 0, i = 0; y < f.rows; y++) {
    for (let x = 0; x < f.cols; x++, i++) {
      let best = 0
      let bd = Infinity
      for (let k = 0; k < N; k++) {
        const dx = (x - sx[k]) * aspect
        const dy = y - sy[k]
        const d = dx * dx + dy * dy
        if (d < bd) {
          bd = d
          best = k
        }
      }
      id[i] = best
      cx[best] += x
      cy[best] += y
      cnt[best]++
    }
  }
  for (let k = 0; k < N; k++) {
    if (cnt[k]) {
      cx[k] /= cnt[k]
      cy[k] /= cnt[k]
    } else {
      cx[k] = sx[k]
      cy[k] = sy[k]
    }
  }
  const border = new Uint8Array(n)
  for (let y = 0, i = 0; y < f.rows; y++) {
    for (let x = 0; x < f.cols; x++, i++) {
      if ((x + 1 < f.cols && id[i + 1] !== id[i]) || (y + 1 < f.rows && id[i + f.cols] !== id[i])) border[i] = 1
    }
  }
  const s = { id, cx, cy, border }
  shardCache.set(f, s)
  return s
}

const RAINBOW: RGB[] = Array.from({ length: 256 }, (_, i) => hslToRgb(i / 256, 0.9, 0.64))

// ---------------------------------------------------------------------------
// animations
// ---------------------------------------------------------------------------

export const ANIMATIONS: AnimDef[] = [
  {
    id: 'none',
    name: 'Still',
    hint: 'No motion',
    duration: 4,
    run: emitStatic,
  },
  {
    id: 'decode',
    name: 'Decode',
    hint: 'Scrambled glyphs resolve into the image',
    duration: 4.5,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, pool, hl, intensity } = c
      const fg = f.fg
      const tick = Math.floor(c.time * 16)
      const d = clamp01(p / 0.7)
      const outro = p > 0.86 ? (p - 0.86) / 0.14 : 0
      const noise = 0.1 + 0.1 * intensity
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const start = (x / f.cols) * 0.6 + hash(i) * 0.25
          const state = outro > 0 && hash2(i, 7) < outro * 1.15 ? 0 : d < start ? 0 : d < start + 0.15 ? 1 : 2
          if (state === 2) {
            out.push(x, y, gi[i], 1, 0, fg[o], fg[o + 1], fg[o + 2], fg[o + 3])
          } else if (state === 1) {
            const g = pick(pool, hash2(i, tick))
            const t = 0.75 * intensity
            out.push(x, y, g, 1, 0, mix(fg[o], hl[0], t), mix(fg[o + 1], hl[1], t), mix(fg[o + 2], hl[2], t), 255)
          } else {
            const g = pick(pool, hash2(i, tick >> 2))
            out.push(x, y, g, 1, 0, fg[o], fg[o + 1], fg[o + 2], fg[o + 3] * noise)
          }
        }
      }
    },
  },
  {
    id: 'matrix',
    name: 'Rain',
    hint: 'Digital rain sweeps and lights up the art',
    duration: 6,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, pool, hl, intensity } = c
      const fg = f.fg
      const tick = Math.floor(c.time * 12)
      for (let x = 0; x < f.cols; x++) {
        const k = 1 + Math.floor(hash(x * 3 + 1) * 2.99)
        const off = hash(x * 3 + 2)
        const L = f.rows * (0.35 + hash(x * 3 + 3) * 0.45)
        const head = (((p * k + off) % 1) + 1) % 1 * (f.rows + L)
        for (let y = 0; y < f.rows; y++) {
          const i = y * f.cols + x
          const o = i * 4
          const d = head - y
          const trail = d >= 0 && d < L ? 1 - d / L : 0
          if (d >= 0 && d < 1) {
            const g = pick(pool, hash2(i, tick))
            out.push(x, y, g, 1, 0, mix(hl[0], 255, 0.6), mix(hl[1], 255, 0.6), mix(hl[2], 255, 0.6), 255)
            continue
          }
          if (blank[i]) {
            if (trail > 0) {
              const g = pick(pool, hash2(i, tick >> 1))
              out.push(x, y, g, 1, 0, hl[0], hl[1], hl[2], 255 * trail * trail * 0.45 * intensity)
            }
            continue
          }
          const swap = trail > 0.55 && hash2(i, tick) < 0.18 * intensity
          const t = trail * 0.65 * intensity
          const a = (0.2 + 0.8 * Math.pow(trail, 1.2)) * fg[o + 3]
          out.push(
            x,
            y,
            swap ? pick(pool, hash2(i, tick + 3)) : gi[i],
            1,
            0,
            mix(fg[o], hl[0], t),
            mix(fg[o + 1], hl[1], t),
            mix(fg[o + 2], hl[2], t),
            a,
          )
        }
      }
    },
  },
  {
    id: 'wave',
    name: 'Wave',
    hint: 'A liquid sine wave rolls through',
    duration: 3,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, hl, intensity } = c
      const fg = f.fg
      const fx = (TAU * 1.5) / f.cols
      const fy = (TAU * 1.0) / f.rows
      const amp = 1.4 * intensity
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const s = Math.sin(x * fx + y * 0.04 - TAU * p)
          const dx = Math.cos(y * fy - TAU * p) * amp * 0.35
          const crest = Math.pow(Math.max(0, s), 4) * 0.6 * intensity
          out.push(
            x + dx,
            y + s * amp,
            gi[i],
            1 + 0.14 * s * intensity,
            0,
            mix(fg[o], hl[0], crest),
            mix(fg[o + 1], hl[1], crest),
            mix(fg[o + 2], hl[2], crest),
            fg[o + 3] * (0.78 + 0.22 * s),
          )
        }
      }
    },
  },
  {
    id: 'glitch',
    name: 'Glitch',
    hint: 'Datamosh bursts, slices and chromatic split',
    duration: 4,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, pool, hl, intensity } = c
      const fg = f.fg
      const tick = Math.floor(c.time * 20)
      let g = 0.06
      for (let b = 0; b < 6; b++) {
        const start = hash(b * 13 + 1)
        const len = 0.03 + hash(b * 13 + 2) * 0.09
        const q = p - start
        if (q >= 0 && q < len) g += Math.sin((Math.PI * q) / len) * (0.5 + hash(b * 13 + 3) * 0.5)
      }
      g = Math.min(1, g) * intensity
      const shifts = new Float32Array(f.rows)
      for (let y = 0; y < f.rows; y++) {
        const band = y >> 2
        if (hash2(band, tick) < g * 0.55) shifts[y] = Math.round((hash2(band, tick + 1) - 0.5) * f.cols * 0.18 * g)
      }
      const split = g * 1.2
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const xx = x + shifts[y]
          const corrupt = hash2(i, tick) < g * 0.12
          const glyph = corrupt ? pick(pool, hash2(i, tick + 9)) : gi[i]
          if (split > 0.15) {
            out.push(xx - split, y, glyph, 1, 0, 255, 30, 70, 120 * g)
            out.push(xx + split, y, glyph, 1, 0, 0, 230, 255, 120 * g)
          }
          const hot = shifts[y] !== 0 && hash2(y, tick + 5) < 0.35
          out.push(
            xx,
            y,
            glyph,
            1,
            0,
            hot ? hl[0] : fg[o],
            hot ? hl[1] : fg[o + 1],
            hot ? hl[2] : fg[o + 2],
            fg[o + 3],
          )
        }
      }
    },
  },
  {
    id: 'assemble',
    name: 'Assemble',
    hint: 'Glyphs fly in to form the image, then burst apart',
    duration: 5,
    run(c) {
      const { f, out, gi, blank, p, hl, intensity, aspect } = c
      const fg = f.fg
      const cx = f.cols / 2
      const cy = f.rows / 2
      const R = Math.max(f.cols * aspect, f.rows) * (0.5 + intensity * 0.7)
      let fadeBg = 1
      if (p < 0.5) fadeBg = clamp01(p / 0.5)
      else if (p > 0.78) fadeBg = 1 - clamp01((p - 0.78) / 0.22)
      emitBg(c, fadeBg)
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const a = hash(i) * TAU
          const r = R * (0.6 + hash(i + 11) * 0.8)
          const sx = cx + (Math.cos(a) * r) / aspect
          const sy = cy + Math.sin(a) * r
          const delay = hash(i + 23) * 0.3
          let e: number
          if (p < 0.5) e = easeOutExpo(clamp01((p / 0.5 - delay) / 0.7))
          else if (p < 0.78) e = 1
          else e = 1 - easeInExpo(clamp01(((p - 0.78) / 0.22 - delay * 0.5) / 0.85))
          const inv = 1 - e
          const spin = (hash(i + 31) - 0.5) * 8 * intensity
          const t = inv * 0.7
          out.push(
            mix(sx, x, e),
            mix(sy, y, e),
            gi[i],
            1 + inv * hash(i + 41) * 2 * intensity,
            spin * inv,
            mix(fg[o], hl[0], t),
            mix(fg[o + 1], hl[1], t),
            mix(fg[o + 2], hl[2], t),
            fg[o + 3] * Math.sqrt(e),
          )
        }
      }
    },
  },
  {
    id: 'ripple',
    name: 'Ripple',
    hint: 'Concentric waves swell glyph density',
    duration: 3,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, hl, intensity, aspect, ramp, rampPos } = c
      const fg = f.fg
      const cx = f.cols / 2
      const cy = f.rows / 2
      const maxR = Math.hypot(cx * aspect, cy) || 1
      const last = ramp.length - 1
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          const rp = rampPos[i]
          if (blank[i] && rp < 0) continue
          const o = i * 4
          const r = Math.hypot((x + 0.5 - cx) * aspect, y + 0.5 - cy) / maxR
          const w = Math.sin(r * TAU * 4 - TAU * p * 2)
          let glyph = gi[i]
          if (rp >= 0 && last > 0) {
            const np = Math.max(0, Math.min(last, rp + Math.round(w * 2.2 * intensity)))
            glyph = ramp[np]
            if (glyph === ramp[0] && blank[i]) continue
          } else if (blank[i]) continue
          const hot = Math.pow(Math.max(0, w), 3) * 0.6 * intensity
          out.push(
            x,
            y,
            glyph,
            1 + 0.3 * intensity * Math.max(0, w),
            0,
            mix(fg[o], hl[0], hot),
            mix(fg[o + 1], hl[1], hot),
            mix(fg[o + 2], hl[2], hot),
            fg[o + 3] * (0.7 + 0.3 * (w * 0.5 + 0.5)),
          )
        }
      }
    },
  },
  {
    id: 'holo',
    name: 'Holo',
    hint: 'Iridescent foil with a sweeping light band',
    duration: 3.5,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, intensity } = c
      const fg = f.fg
      const ink = f.ink
      const b = -0.35 + p * 1.7
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const u = (x / f.cols) * 0.62 + (y / f.rows) * 0.38
          const d = (u - b) / 0.11
          const h = Math.exp(-d * d)
          const rb = RAINBOW[Math.floor((((u * 1.6 - p) % 1) + 1) % 1 * 255)]
          const t = (0.25 + 0.65 * h) * intensity * (0.45 + 0.55 * ink[i])
          let r = mix(fg[o], rb[0], t)
          let g = mix(fg[o + 1], rb[1], t)
          let bl = mix(fg[o + 2], rb[2], t)
          const wt = h * 0.45 * intensity
          r = mix(r, 255, wt)
          g = mix(g, 255, wt)
          bl = mix(bl, 255, wt)
          out.push(x, y, gi[i], 1 + 0.14 * h * intensity, 0, r, g, bl, fg[o + 3])
        }
      }
    },
  },
  {
    id: 'pulse',
    name: 'Pulse',
    hint: 'Halftone breathing in a diagonal tide',
    duration: 3,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, hl, intensity } = c
      const fg = f.fg
      const ink = f.ink
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const d = (x / f.cols + y / f.rows) * TAU
          const s = 0.5 + 0.5 * Math.sin(TAU * p * 2 - d)
          const scale = Math.max(0.15, 1 + (s - 0.5) * 0.9 * intensity * (0.4 + ink[i]))
          const t = Math.pow(s, 6) * 0.5 * intensity
          out.push(
            x,
            y,
            gi[i],
            scale,
            0,
            mix(fg[o], hl[0], t),
            mix(fg[o + 1], hl[1], t),
            mix(fg[o + 2], hl[2], t),
            fg[o + 3] * (0.55 + 0.45 * s),
          )
        }
      }
    },
  },
  {
    id: 'crt',
    name: 'Scanline',
    hint: 'A retro monitor with a rolling scan beam',
    duration: 3,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, hl, intensity } = c
      const fg = f.fg
      const tick = Math.floor(c.time * 30)
      const scan = p * (f.rows + 12) - 6
      const flicker = 0.9 + 0.1 * hash(tick)
      for (let y = 0, i = 0; y < f.rows; y++) {
        const d = y - scan
        const glow = Math.exp(-(d * d) / 6)
        const jitter = (hash2(y, tick) - 0.5) * 0.5 * intensity * glow
        const line = (y & 1 ? 0.8 : 1) * flicker
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const t = glow * 0.65 * intensity
          if (glow > 0.2) out.push(x + jitter + 0.18, y, gi[i], 1, 0, hl[0], hl[1], hl[2], 90 * glow * intensity)
          out.push(
            x + jitter,
            y,
            gi[i],
            1 + glow * 0.12 * intensity,
            0,
            mix(fg[o], 255, t),
            mix(fg[o + 1], 255, t),
            mix(fg[o + 2], 255, t),
            fg[o + 3] * line,
          )
        }
      }
    },
  },
  {
    id: 'silk',
    name: 'Silk',
    hint: 'The image ripples like fabric in a breeze',
    duration: 5,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, intensity } = c
      const fg = f.fg
      const a = TAU * p
      const amp = 1.3 * intensity
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const n1 = Math.sin(x * 0.07 + Math.sin(y * 0.11 + a) * 1.6 + a)
          const n2 = Math.cos(y * 0.09 + Math.cos(x * 0.05 - a) * 1.6 - a)
          const sheen = Math.max(0, n1 * n2) ** 2 * 0.4 * intensity
          out.push(
            x + n1 * amp,
            y + n2 * amp * 0.55,
            gi[i],
            1 + 0.1 * n2 * intensity,
            n1 * 0.12 * intensity,
            mix(fg[o], 255, sheen),
            mix(fg[o + 1], 255, sheen),
            mix(fg[o + 2], 255, sheen),
            fg[o + 3] * (0.84 + 0.16 * n2),
          )
        }
      }
    },
  },
  {
    id: 'kaleido',
    name: 'Kaleido',
    hint: 'A turning kaleidoscope made from the image',
    duration: 8,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, intensity, aspect } = c
      const fg = f.fg
      const N = 6
      const wedge = TAU / N
      const cx = f.cols / 2
      const cy = f.rows / 2
      const rot = p * 2 * wedge
      const zoom = 1 - 0.35 * intensity * (0.5 - 0.5 * Math.cos(TAU * p))
      for (let y = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++) {
          const vx = (x + 0.5 - cx) * aspect
          const vy = y + 0.5 - cy
          const r = Math.hypot(vx, vy) * zoom
          let t = (((Math.atan2(vy, vx) + rot) % (2 * wedge)) + 2 * wedge) % (2 * wedge)
          if (t > wedge) t = 2 * wedge - t
          const ix = Math.round(cx + (r * Math.cos(t - wedge / 2)) / aspect - 0.5)
          const iy = Math.round(cy + r * Math.sin(t - wedge / 2) - 0.5)
          if (ix < 0 || iy < 0 || ix >= f.cols || iy >= f.rows) continue
          const j = iy * f.cols + ix
          if (blank[j]) continue
          const o = j * 4
          out.push(x, y, gi[j], 1, 0, fg[o], fg[o + 1], fg[o + 2], fg[o + 3])
        }
      }
    },
  },
  {
    id: 'burn',
    name: 'Burn',
    hint: 'Burns away along glowing embers, then grows back',
    duration: 6,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, pool, hl, intensity } = c
      const fg = f.fg
      const ease = (t: number) => t * t * (3 - 2 * t)
      const th = p < 0.45 ? ease(p / 0.45) : p < 0.55 ? 1 : 1 - ease((p - 0.55) / 0.45)
      const T = -0.15 + th * 1.3
      const e = 0.07 + 0.05 * intensity
      const tick = Math.floor(c.time * 14)
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const d = fbm(x * 0.08, y * 0.13) - T
          if (d < -e) continue
          if (d < e) {
            const k = (d + e) / (2 * e)
            const hot = 1 - k
            const ember = k < 0.45
            const r = ember ? mix(255, hl[0], k / 0.45) : mix(hl[0], fg[o], (k - 0.45) / 0.55)
            const g = ember ? mix(232, hl[1], k / 0.45) : mix(hl[1], fg[o + 1], (k - 0.45) / 0.55)
            const b = ember ? mix(160, hl[2], k / 0.45) : mix(hl[2], fg[o + 2], (k - 0.45) / 0.55)
            out.push(
              x,
              y - hot * 0.7 * intensity,
              ember ? pick(pool, hash2(i, tick)) : gi[i],
              1 + hot * 0.45 * intensity,
              0,
              r,
              g,
              b,
              255,
            )
          } else {
            out.push(x, y, gi[i], 1, 0, fg[o], fg[o + 1], fg[o + 2], fg[o + 3])
          }
        }
      }
    },
  },
  {
    id: 'shatter',
    name: 'Shatter',
    hint: 'Cracks into shards that drift apart and fit back together',
    duration: 5,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, hl, intensity, aspect } = c
      const fg = f.fg
      const sh = shardsFor(f, aspect)
      const ease = (t: number) => t * t * (3 - 2 * t)
      let e = 0
      if (p < 0.12) e = 0
      else if (p < 0.5) e = easeOutExpo((p - 0.12) / 0.38)
      else if (p < 0.72) e = 1 + ((p - 0.5) / 0.22) * 0.15
      else e = 1.15 * (1 - ease((p - 0.72) / 0.28))
      const flash = p < 0.12 ? Math.sin((Math.PI * p) / 0.12) : 0
      const cx = f.cols / 2
      const cy = f.rows / 2
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const k = sh.id[i]
          const scx = sh.cx[k]
          const scy = sh.cy[k]
          let dx = (scx - cx) * aspect
          let dy = scy - cy
          const dl = Math.hypot(dx, dy) || 1
          dx /= dl
          dy /= dl
          const dist = (5 + hash(k * 9 + 4) * 9) * intensity * e
          const spin = (hash(k * 9 + 5) - 0.5) * 1.3 * intensity * e
          const rx = (x - scx) * aspect
          const ry = y - scy
          const cs = Math.cos(spin)
          const sn = Math.sin(spin)
          const nx = scx + (rx * cs - ry * sn) / aspect + (dx * dist) / aspect
          const ny = scy + rx * sn + ry * cs + dy * dist
          const edge = sh.border[i] ? flash : 0
          out.push(
            nx,
            ny,
            gi[i],
            1,
            spin,
            mix(mix(fg[o], hl[0], edge), 255, edge * 0.6),
            mix(mix(fg[o + 1], hl[1], edge), 255, edge * 0.6),
            mix(mix(fg[o + 2], hl[2], edge), 255, edge * 0.6),
            fg[o + 3],
          )
        }
      }
    },
  },
  {
    id: 'tilt',
    name: 'Tilt',
    hint: 'A slow 3D wobble where dense glyphs float forward',
    duration: 6,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, intensity, aspect } = c
      const fg = f.fg
      const ink = f.ink
      const ax = Math.sin(TAU * p) * 0.45 * intensity
      const ay = Math.cos(TAU * p) * 0.55 * intensity
      const cx = f.cols / 2
      const cy = f.rows / 2
      const F = Math.max(f.cols * aspect, f.rows) * 1.5
      const depth = Math.max(f.cols * aspect, f.rows) * 0.12 * intensity
      const cX = Math.cos(ax)
      const sX = Math.sin(ax)
      const cY = Math.cos(ay)
      const sY = Math.sin(ay)
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const vx = (x + 0.5 - cx) * aspect
          const vy = y + 0.5 - cy
          const vz = -ink[i] * depth
          const x1 = vx * cY + vz * sY
          const z1 = -vx * sY + vz * cY
          const y2 = vy * cX - z1 * sX
          const z2 = vy * sX + z1 * cX
          const k = F / (F + z2)
          const lit = clamp01(-z2 / (depth + 1)) * 0.35
          out.push(
            (x1 * k) / aspect + cx - 0.5,
            y2 * k + cy - 0.5,
            gi[i],
            k,
            0,
            mix(fg[o], 255, lit),
            mix(fg[o + 1], 255, lit),
            mix(fg[o + 2], 255, lit),
            fg[o + 3],
          )
        }
      }
    },
  },
  {
    id: 'glitter',
    name: 'Glitter',
    hint: 'Sequins twinkle across the art',
    duration: 4,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, hl, intensity } = c
      const fg = f.fg
      const star = glyphs.index(0x2726)
      const plus = glyphs.index(43)
      const share = 0.12 + 0.4 * intensity
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          let s = 0
          if (hash(i * 5 + 2) < share) {
            const k = 1 + Math.floor(hash(i) * 3)
            s = Math.max(0, Math.sin(TAU * (p * k + hash(i * 3 + 1)))) ** 14
          }
          if (s > 0.05) {
            const w = Math.min(1, s * 1.2)
            out.push(
              x,
              y,
              s > 0.55 ? star : plus,
              1 + s * 1.1 * intensity,
              s * 0.5,
              mix(mix(fg[o], hl[0], 0.3), 255, w),
              mix(mix(fg[o + 1], hl[1], 0.3), 255, w),
              mix(mix(fg[o + 2], hl[2], 0.3), 255, w),
              255,
            )
          } else {
            const shimmer = 0.88 + 0.12 * Math.sin(TAU * (p * 2 + x * 0.03 - y * 0.02))
            out.push(x, y, gi[i], 1, 0, fg[o], fg[o + 1], fg[o + 2], fg[o + 3] * shimmer)
          }
        }
      }
    },
  },
  {
    id: 'warp',
    name: 'Warp',
    hint: 'Jumps to light speed, then snaps back into focus',
    duration: 4,
    run(c) {
      const { f, out, gi, blank, p, hl, intensity, aspect } = c
      const fg = f.fg
      const w = Math.sin(Math.PI * p) ** 4
      emitBg(c, 1 - w * 0.7)
      const cx = f.cols / 2
      const cy = f.rows / 2
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const vx = (x + 0.5 - cx) * aspect
          const vy = y + 0.5 - cy
          const d = 0.3 + hash(i) * 0.7
          const k = 1 + w * d * 5 * intensity
          if (w > 0.05) {
            for (const [t, a] of [
              [0.35, 0.22],
              [0.65, 0.35],
            ]) {
              const kk = 1 + (k - 1) * t
              out.push((vx * kk) / aspect + cx - 0.5, vy * kk + cy - 0.5, gi[i], 1, 0, hl[0], hl[1], hl[2], fg[o + 3] * a * w)
            }
          }
          out.push((vx * k) / aspect + cx - 0.5, vy * k + cy - 0.5, gi[i], 1 + w * d * 0.9, 0, fg[o], fg[o + 1], fg[o + 2], fg[o + 3] * (1 - w * 0.25))
        }
      }
    },
  },
  {
    id: 'runway',
    name: 'Runway',
    hint: 'A spotlight sweeps the art like a catwalk',
    duration: 5,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, hl, intensity, aspect } = c
      const fg = f.fg
      const sx = f.cols * (0.5 + 0.42 * Math.sin(TAU * p))
      const sy = f.rows * (0.5 + 0.16 * Math.sin(2 * TAU * p + 1))
      const R = Math.max(f.cols * aspect, f.rows) * 0.3
      const dim = 1 - 0.8 * intensity
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const d = Math.hypot((x + 0.5 - sx) * aspect, y + 0.5 - sy)
          const t = clamp01(1 - d / R)
          const s = t * t * (3 - 2 * t)
          const ring = Math.exp(-(((d - R * 0.88) / (R * 0.07)) ** 2)) * 0.5 * intensity
          const r = mix(mix(fg[o], 255, s * s * 0.4), hl[0], ring)
          const g = mix(mix(fg[o + 1], 255, s * s * 0.4), hl[1], ring)
          const b = mix(mix(fg[o + 2], 255, s * s * 0.4), hl[2], ring)
          out.push(x, y, gi[i], 1 + s * 0.15, 0, r, g, b, fg[o + 3] * (dim + (1 - dim) * Math.max(s, ring)))
        }
      }
    },
  },
]

export function getAnimation(id: string): AnimDef {
  return ANIMATIONS.find((a) => a.id === id) ?? ANIMATIONS[0]
}


/** Precompute per-frame data shared by all animations. */
export function prepareFrame(f: AsciiFrame, rampCodes: ArrayLike<number>, poolCodes: ArrayLike<number>) {
  const n = f.cols * f.rows
  const gi = glyphs.indices(f.chars)
  const blank = new Uint8Array(n)
  for (let i = 0; i < n; i++) blank[i] = isBlank(f.chars[i]) || f.fg[i * 4 + 3] === 0 ? 1 : 0
  const ramp = glyphs.indices(rampCodes)
  const pos = new Map<number, number>()
  for (let i = 0; i < rampCodes.length; i++) pos.set(rampCodes[i], i)
  const rampPos = new Int16Array(n)
  for (let i = 0; i < n; i++) rampPos[i] = pos.get(f.chars[i]) ?? -1
  const poolArr: number[] = []
  for (let i = 0; i < poolCodes.length; i++) if (!isBlank(poolCodes[i])) poolArr.push(poolCodes[i])
  if (poolArr.length === 0) poolArr.push(35, 37, 64, 42)
  const pool = glyphs.indices(poolArr)
  return { gi, blank, ramp, rampPos, pool }
}
