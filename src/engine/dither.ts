import type { DitherMode } from './types'
import { floorLevel, nearestLevel } from './ramp'

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)

/**
 * Quantize a grid of values (0..1) to arbitrary sorted `levels`, with optional
 * dithering. Cells where `mask[i]` is 0 are forced to level 0 and do not
 * receive diffused error. Returns level indices.
 */
export function quantize(
  values: Float32Array,
  w: number,
  h: number,
  levels: Float32Array,
  mode: DitherMode,
  mask?: Uint8Array,
): Uint16Array {
  const n = w * h
  const out = new Uint16Array(n)
  if (mode === 'none') {
    for (let i = 0; i < n; i++) out[i] = mask && !mask[i] ? 0 : nearestLevel(levels, values[i])
    return out
  }
  if (mode === 'bayer') {
    const last = levels.length - 1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (mask && !mask[i]) continue
        const v = values[i]
        const lo = floorLevel(levels, v)
        if (lo >= last) {
          out[i] = last
          continue
        }
        const a = levels[lo]
        const b = levels[lo + 1]
        const t = (v - a) / (b - a || 1)
        out[i] = t > BAYER4[(y & 3) * 4 + (x & 3)] ? lo + 1 : lo
      }
    }
    return out
  }
  const buf = Float32Array.from(values)
  const atk = mode === 'atkinson'
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (mask && !mask[i]) continue
      const v = buf[i] < -0.5 ? -0.5 : buf[i] > 1.5 ? 1.5 : buf[i]
      const q = nearestLevel(levels, v)
      out[i] = q
      const err = v - levels[q]
      if (err === 0) continue
      if (atk) {
        const e = err / 8
        spread(buf, mask, w, h, x + 1, y, e)
        spread(buf, mask, w, h, x + 2, y, e)
        spread(buf, mask, w, h, x - 1, y + 1, e)
        spread(buf, mask, w, h, x, y + 1, e)
        spread(buf, mask, w, h, x + 1, y + 1, e)
        spread(buf, mask, w, h, x, y + 2, e)
      } else {
        spread(buf, mask, w, h, x + 1, y, (err * 7) / 16)
        spread(buf, mask, w, h, x - 1, y + 1, (err * 3) / 16)
        spread(buf, mask, w, h, x, y + 1, (err * 5) / 16)
        spread(buf, mask, w, h, x + 1, y + 1, err / 16)
      }
    }
  }
  return out
}

function spread(
  buf: Float32Array,
  mask: Uint8Array | undefined,
  w: number,
  h: number,
  x: number,
  y: number,
  e: number,
): void {
  if (x < 0 || x >= w || y >= h) return
  const i = y * w + x
  if (mask && !mask[i]) return
  buf[i] += e
}
