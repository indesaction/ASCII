import type { RGB } from './types'

export function clamp(v: number, lo = 0, hi = 1): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const v = ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16)
  return '#' + v.slice(1)
}

export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Readable text color (black/white) on top of a given color. */
export function contrastText(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  return luminance(r, g, b) > 0.55 ? '#111111' : '#ffffff'
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 1) + 1) % 1
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  }
  return [f(0), f(8), f(4)]
}

/** Sample a multi-stop gradient (stops are evenly spaced). Writes into `out`. */
export function sampleGradient(stops: RGB[], t: number, out: RGB): RGB {
  const n = stops.length
  if (n === 1) {
    out[0] = stops[0][0]
    out[1] = stops[0][1]
    out[2] = stops[0][2]
    return out
  }
  const x = clamp(t) * (n - 1)
  const i = Math.min(n - 2, Math.floor(x))
  const f = x - i
  const a = stops[i]
  const b = stops[i + 1]
  out[0] = a[0] + (b[0] - a[0]) * f
  out[1] = a[1] + (b[1] - a[1]) * f
  out[2] = a[2] + (b[2] - a[2]) * f
  return out
}

/** Index of the perceptually nearest palette color ("redmean" distance). */
export function nearestColor(palette: RGB[], r: number, g: number, b: number): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i]
    const rm = (r + p[0]) / 2
    const dr = r - p[0]
    const dg = g - p[1]
    const db = b - p[2]
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// CMYK
// ---------------------------------------------------------------------------

export type CMYK = [number, number, number, number]

export interface CmykOptions {
  /** Print pure black as a rich black (C60 M40 Y40 K100). */
  richBlack: boolean
  /** Print neutral grays with black ink only (avoids color casts / registration issues). */
  neutralK: boolean
  /** Total area coverage limit in percent (e.g. 300). */
  inkLimit: number
}

export const DEFAULT_CMYK: CmykOptions = { richBlack: true, neutralK: true, inkLimit: 300 }

/** RGB (0-255) → CMYK (0-1) with full GCR, optional rich black, neutral-K and ink limit. */
export function rgbToCmyk(r: number, g: number, b: number, opt: CmykOptions = DEFAULT_CMYK): CMYK {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const k = 1 - max
  if (k >= 0.999) {
    return opt.richBlack ? [0.6, 0.4, 0.4, 1] : [0, 0, 0, 1]
  }
  if (opt.neutralK && max - min < 0.02) {
    const l = luminance(r, g, b)
    return [0, 0, 0, round4(1 - l)]
  }
  let c = (1 - rn - k) / (1 - k)
  let m = (1 - gn - k) / (1 - k)
  let y = (1 - bn - k) / (1 - k)
  const limit = opt.inkLimit / 100
  const total = c + m + y + k
  if (total > limit) {
    const s = Math.max(0, limit - k) / (c + m + y)
    c *= s
    m *= s
    y *= s
  }
  return [round4(c), round4(m), round4(y), round4(k)]
}

function round4(v: number): number {
  return Math.round(clamp(v) * 10000) / 10000
}

// Approximate process-ink colors on coated paper, used for the soft proof.
const INK_C: RGB = [0, 160, 227]
const INK_M: RGB = [229, 0, 126]
const INK_Y: RGB = [255, 237, 0]
const INK_K: RGB = [30, 28, 29]
const PAPER: RGB = [250, 249, 246]

/** Simulate how CMYK coverage looks on paper (subtractive, multiplicative model). */
export function cmykToProofRgb([c, m, y, k]: CMYK): RGB {
  const out: RGB = [0, 0, 0]
  for (let ch = 0; ch < 3; ch++) {
    let v = PAPER[ch] / 255
    v *= 1 - c * (1 - INK_C[ch] / 255)
    v *= 1 - m * (1 - INK_M[ch] / 255)
    v *= 1 - y * (1 - INK_Y[ch] / 255)
    v *= 1 - k * (1 - INK_K[ch] / 255)
    out[ch] = Math.round(v * 255)
  }
  return out
}

/** Cached soft-proof transform for a color (RGB → print simulation). */
const proofCache = new Map<number, number>()
export function proofRgb(r: number, g: number, b: number, opt: CmykOptions = DEFAULT_CMYK): RGB {
  const key = (r << 16) | (g << 8) | b
  let v = proofCache.get(key)
  if (v === undefined) {
    const p = cmykToProofRgb(rgbToCmyk(r, g, b, opt))
    v = (p[0] << 16) | (p[1] << 8) | p[2]
    if (proofCache.size > 50000) proofCache.clear()
    proofCache.set(key, v)
  }
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function cmykLabel([c, m, y, k]: CMYK): string {
  const p = (v: number) => Math.round(v * 100)
  return `C${p(c)} M${p(m)} Y${p(y)} K${p(k)}`
}

// ---------------------------------------------------------------------------
// Palette extraction (k-means++)
// ---------------------------------------------------------------------------

export function extractPalette(data: Uint8ClampedArray, k: number, seed = 7): RGB[] {
  const pts: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    pts.push(data[i], data[i + 1], data[i + 2])
  }
  const n = pts.length / 3
  if (n === 0) return [[0, 0, 0]]
  let s = seed
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const centers: number[] = []
  const first = Math.floor(rand() * n)
  centers.push(pts[first * 3], pts[first * 3 + 1], pts[first * 3 + 2])
  const dist = new Float64Array(n)
  while (centers.length / 3 < k) {
    let sum = 0
    for (let i = 0; i < n; i++) {
      let best = Infinity
      for (let c = 0; c < centers.length; c += 3) {
        const dr = pts[i * 3] - centers[c]
        const dg = pts[i * 3 + 1] - centers[c + 1]
        const db = pts[i * 3 + 2] - centers[c + 2]
        const d = dr * dr + dg * dg + db * db
        if (d < best) best = d
      }
      dist[i] = best
      sum += best
    }
    if (sum === 0) break
    let target = rand() * sum
    let pick = 0
    for (let i = 0; i < n; i++) {
      target -= dist[i]
      if (target <= 0) {
        pick = i
        break
      }
    }
    centers.push(pts[pick * 3], pts[pick * 3 + 1], pts[pick * 3 + 2])
  }
  const kk = centers.length / 3
  const assign = new Int32Array(n)
  for (let iter = 0; iter < 12; iter++) {
    const acc = new Float64Array(kk * 4)
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < kk; c++) {
        const dr = pts[i * 3] - centers[c * 3]
        const dg = pts[i * 3 + 1] - centers[c * 3 + 1]
        const db = pts[i * 3 + 2] - centers[c * 3 + 2]
        const d = dr * dr + dg * dg + db * db
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      assign[i] = best
      acc[best * 4] += pts[i * 3]
      acc[best * 4 + 1] += pts[i * 3 + 1]
      acc[best * 4 + 2] += pts[i * 3 + 2]
      acc[best * 4 + 3]++
    }
    for (let c = 0; c < kk; c++) {
      const cnt = acc[c * 4 + 3]
      if (cnt > 0) {
        centers[c * 3] = acc[c * 4] / cnt
        centers[c * 3 + 1] = acc[c * 4 + 1] / cnt
        centers[c * 3 + 2] = acc[c * 4 + 2] / cnt
      }
    }
  }
  const out: RGB[] = []
  for (let c = 0; c < kk; c++) {
    out.push([Math.round(centers[c * 3]), Math.round(centers[c * 3 + 1]), Math.round(centers[c * 3 + 2])])
  }
  out.sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]))
  return out
}
