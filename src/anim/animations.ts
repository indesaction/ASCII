import { hslToRgb } from '../engine/color'
import { FULL_BLOCK } from '../engine/glyphs'
import type { AsciiFrame, RGB } from '../engine/types'
import { isBlank } from '../engine/types'
import { GEOM_STRIDE, type Blend, type RenderList, glyphs } from '../render/list'

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
const easeOutBounce = (t: number) => {
  const n1 = 7.5625
  const d1 = 2.75
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
  return n1 * (t -= 2.625 / d1) * t + 0.984375
}
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
    id: 'typewriter',
    name: 'Type',
    hint: 'Typed out glyph by glyph with a cursor',
    duration: 5,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, hl } = c
      const fg = f.fg
      let total = 0
      for (let i = 0; i < blank.length; i++) if (!blank[i]) total++
      const revealed = Math.floor(clamp01(p / 0.72) * total)
      const fade = p > 0.9 ? 1 - (p - 0.9) / 0.1 : 1
      const fresh = Math.max(1, total * 0.015)
      let k = 0
      let cx = -1
      let cy = -1
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          if (k >= revealed) {
            if (cx < 0) {
              cx = x
              cy = y
            }
            k++
            continue
          }
          const o = i * 4
          const age = (revealed - k) / fresh
          const pop = age < 1 ? 1 - age : 0
          out.push(
            x,
            y,
            gi[i],
            1 + pop * 0.5,
            0,
            mix(fg[o], hl[0], pop),
            mix(fg[o + 1], hl[1], pop),
            mix(fg[o + 2], hl[2], pop),
            fg[o + 3] * fade,
          )
          k++
        }
      }
      if (cx >= 0 && (c.time * 2.5) % 1 < 0.6) {
        out.push(cx, cy, glyphs.index(FULL_BLOCK), 1, 0, hl[0], hl[1], hl[2], 255)
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
    id: 'vortex',
    name: 'Vortex',
    hint: 'The image twists into a spiral and back',
    duration: 4,
    run(c) {
      emitBg(c)
      const { f, out, gi, blank, p, hl, intensity, aspect } = c
      const fg = f.fg
      const cx = f.cols / 2
      const cy = f.rows / 2
      const maxR = Math.hypot(cx * aspect, cy) || 1
      const s = Math.sin(Math.PI * p)
      const twist = s * s * TAU * 1.2 * intensity
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const vx = (x + 0.5 - cx) * aspect
          const vy = y + 0.5 - cy
          const r = Math.hypot(vx, vy) / maxR
          const fall = Math.pow(Math.max(0, 1 - r), 1.5)
          const ang = twist * fall
          const cs = Math.cos(ang)
          const sn = Math.sin(ang)
          const nx = (vx * cs - vy * sn) / aspect + cx - 0.5
          const ny = vx * sn + vy * cs + cy - 0.5
          const t = fall * s * 0.5 * intensity
          out.push(
            nx,
            ny,
            gi[i],
            1 - 0.3 * s * s * fall,
            ang,
            mix(fg[o], hl[0], t),
            mix(fg[o + 1], hl[1], t),
            mix(fg[o + 2], hl[2], t),
            fg[o + 3],
          )
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
    id: 'fall',
    name: 'Gravity',
    hint: 'Glyphs drop in with a bounce, then fall away',
    duration: 5,
    run(c) {
      const { f, out, gi, blank, p, intensity } = c
      const fg = f.fg
      let fadeBg = 1
      if (p < 0.5) fadeBg = clamp01(p / 0.45)
      else if (p > 0.75) fadeBg = 1 - clamp01((p - 0.75) / 0.2)
      emitBg(c, fadeBg)
      for (let y = 0, i = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++, i++) {
          if (blank[i]) continue
          const o = i * 4
          const delay = hash(x + 101) * 0.2 + ((f.rows - y) / f.rows) * 0.2
          let yy = y
          let rot = 0
          if (p < 0.5) {
            const e = easeOutBounce(clamp01((p / 0.5 - delay) / 0.6))
            yy = y - (1 - e) * (f.rows + 2 + hash(i) * f.rows * 0.5)
          } else if (p > 0.75) {
            const t = clamp01(((p - 0.75) / 0.25 - delay * 0.5) / 0.8)
            yy = y + t * t * (f.rows + 6)
            rot = (hash(i + 7) - 0.5) * t * 3 * intensity
          }
          out.push(x, yy, gi[i], 1, rot, fg[o], fg[o + 1], fg[o + 2], fg[o + 3])
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
]

export function getAnimation(id: string): AnimDef {
  return ANIMATIONS.find((a) => a.id === id) ?? ANIMATIONS[0]
}

/** Push glyphs away from a pointer (cell coordinates). Mutates the list in place. */
export function applyMagnet(
  out: RenderList,
  px: number,
  py: number,
  aspect: number,
  strength: number,
  hl: RGB,
  radius = 9,
): void {
  const g = out.geom
  const col = out.color
  for (let i = out.bgCount; i < out.count; i++) {
    const o = i * GEOM_STRIDE
    const dx = (g[o] + 0.5 - px) * aspect
    const dy = g[o + 1] + 0.5 - py
    const d = Math.hypot(dx, dy)
    if (d >= radius || d < 1e-4) continue
    const f = 1 - d / radius
    const push = f * f * radius * 0.55 * strength
    g[o] += ((dx / d) * push) / aspect
    g[o + 1] += (dy / d) * push
    g[o + 2] *= 1 + f * 0.6 * strength
    const c = i * 4
    const t = f * 0.7 * strength
    col[c] = mix(col[c], hl[0], t)
    col[c + 1] = mix(col[c + 1], hl[1], t)
    col[c + 2] = mix(col[c + 2], hl[2], t)
  }
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
