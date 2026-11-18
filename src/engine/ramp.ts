import { CHARSETS } from './presets'
import type { ShapeSettings } from './types'
import { FONT_STACK, geometricCoverage, isGeometric, toCodepoints } from './glyphs'

/**
 * A tone ramp: characters ordered from least to most ink, with their
 * normalized measured ink density (0 = empty, 1 = densest).
 */
export interface ToneRamp {
  chars: Uint32Array
  density: Float32Array
  key: string
}

const cache = new Map<string, ToneRamp>()
let measureCanvas: HTMLCanvasElement | OffscreenCanvas | null = null

export function clearRampCache(): void {
  cache.clear()
  shapeCache.clear()
}

export function charsetString(shape: Pick<ShapeSettings, 'charsetId' | 'customCharset'>): string {
  if (shape.charsetId === 'custom') return shape.customCharset || ' .:-=+*#%@'
  return CHARSETS.find((c) => c.id === shape.charsetId)?.chars ?? CHARSETS[0].chars
}

function getMeasureCtx(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  if (!measureCanvas) {
    if (typeof OffscreenCanvas !== 'undefined') measureCanvas = new OffscreenCanvas(48, 64)
    else if (typeof document !== 'undefined') {
      measureCanvas = document.createElement('canvas')
      measureCanvas.width = 48
      measureCanvas.height = 64
    } else return null
  }
  return measureCanvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
}

/** Measure the ink coverage of a glyph rendered with the bundled font. */
export function measureGlyph(cp: number, weight: number): number {
  if (cp === 32 || cp === 0x2800) return 0
  if (isGeometric(cp)) return geometricCoverage(cp)
  const ctx = getMeasureCtx()
  if (!ctx) return 0.5
  const W = 48
  const H = 64
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.font = `${weight} 40px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(String.fromCodePoint(cp), W / 2, 46)
  const data = ctx.getImageData(0, 0, W, H).data
  let sum = 0
  for (let i = 3; i < data.length; i += 4) sum += data[i]
  // Normalize against the area of one character cell (0.6em × 1.32em at 40px).
  return sum / 255 / (24 * 52.8)
}

export function buildRamp(charset: string, weight: number, keepOrder: boolean): ToneRamp {
  const key = `${charset}|${weight}|${keepOrder ? 1 : 0}`
  const hit = cache.get(key)
  if (hit) return hit
  let cps = [...new Set(toCodepoints(charset))]
  if (cps.length === 0) cps = [32, 35]
  let dens: number[]
  if (keepOrder || cps.length === 1) {
    dens = cps.map((_, i) => (cps.length === 1 ? 1 : i / (cps.length - 1)))
  } else {
    const measured = cps.map((cp) => ({ cp, d: measureGlyph(cp, weight) }))
    measured.sort((a, b) => a.d - b.d)
    cps = measured.map((m) => m.cp)
    const lo = measured[0].d
    const hi = measured[measured.length - 1].d
    const span = hi - lo || 1
    dens = measured.map((m) => (m.d - lo) / span)
    // Guarantee strictly increasing levels so dithering never stalls.
    for (let i = 1; i < dens.length; i++) {
      if (dens[i] <= dens[i - 1]) dens[i] = Math.min(1, dens[i - 1] + 1e-4)
    }
  }
  const ramp: ToneRamp = { chars: Uint32Array.from(cps), density: Float32Array.from(dens), key }
  cache.set(key, ramp)
  return ramp
}

/**
 * Shape vectors: ink coverage of each ramp glyph in a 2×3 grid of sub-regions,
 * normalized so the densest region of any glyph is 1. Used for shape matching.
 */
const shapeCache = new Map<string, Float32Array>()

export function glyphShapes(ramp: ToneRamp, weight: number): Float32Array {
  const key = ramp.key + '|' + weight
  const hit = shapeCache.get(key)
  if (hit) return hit
  const n = ramp.chars.length
  const out = new Float32Array(n * 6)
  const ctx = getMeasureCtx()
  const W = 48
  const H = 64
  // Cell box at 40px: 24px wide, 52.8px tall, centered; baseline at 46.
  const x0 = 12
  const y0 = 46 - 40 * 1.02
  const cw = 24
  const ch = 52.8
  for (let g = 0; g < n; g++) {
    const cp = ramp.chars[g]
    if (cp === 32 || cp === 0x2800 || !ctx) continue
    if (isGeometric(cp)) {
      const d = geometricCoverage(cp)
      for (let k = 0; k < 6; k++) out[g * 6 + k] = d
      continue
    }
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#000'
    ctx.font = `${weight} 40px ${FONT_STACK}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(String.fromCodePoint(cp), W / 2, 46)
    const data = ctx.getImageData(0, 0, W, H).data
    const acc = new Float64Array(6)
    for (let y = 0; y < H; y++) {
      const ry = Math.floor(((y + 0.5 - y0) / ch) * 3)
      if (ry < 0 || ry > 2) continue
      for (let x = 0; x < W; x++) {
        const rx = Math.floor(((x + 0.5 - x0) / cw) * 2)
        if (rx < 0 || rx > 1) continue
        acc[ry * 2 + rx] += data[(y * W + x) * 4 + 3] / 255
      }
    }
    const area = (cw / 2) * (ch / 3)
    for (let k = 0; k < 6; k++) out[g * 6 + k] = acc[k] / area
  }
  // Anchor each glyph's vector to its calibrated tone so shape matching and
  // density mapping agree: mean(vector) == ramp density.
  for (let g = 0; g < n; g++) {
    let mean = 0
    for (let k = 0; k < 6; k++) mean += out[g * 6 + k]
    mean /= 6
    const target = ramp.density[g]
    for (let k = 0; k < 6; k++) out[g * 6 + k] = mean > 1e-6 ? Math.min(1.6, (out[g * 6 + k] * target) / mean) : target
  }
  shapeCache.set(key, out)
  return out
}

/** Index of the ramp level closest to `v` (binary search on sorted densities). */
export function nearestLevel(density: Float32Array, v: number): number {
  let lo = 0
  let hi = density.length - 1
  if (v <= density[0]) return 0
  if (v >= density[hi]) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (density[mid] <= v) lo = mid
    else hi = mid
  }
  return v - density[lo] < density[hi] - v ? lo : hi
}

/** Lower bracketing level index for `v` (density[i] <= v). */
export function floorLevel(density: Float32Array, v: number): number {
  let lo = 0
  let hi = density.length - 1
  if (v >= density[hi]) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (density[mid] <= v) lo = mid
    else hi = mid
  }
  return lo
}
