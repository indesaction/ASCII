/**
 * Glyph registry + render list: the renderer-agnostic description of a frame.
 * Every drawn glyph is an "instance" with a cell-space position, scale,
 * rotation, glyph index and RGBA color.
 */

export class GlyphRegistry {
  readonly codes: number[] = []
  readonly strings: string[] = []
  private map = new Map<number, number>()
  version = 0

  index(cp: number): number {
    let i = this.map.get(cp)
    if (i === undefined) {
      i = this.codes.length
      this.codes.push(cp)
      this.strings.push(String.fromCodePoint(cp))
      this.map.set(cp, i)
      this.version++
    }
    return i
  }

  indices(cps: ArrayLike<number>): Uint16Array {
    const out = new Uint16Array(cps.length)
    for (let i = 0; i < cps.length; i++) out[i] = this.index(cps[i])
    return out
  }
}

export const glyphs = new GlyphRegistry()

export const GEOM_STRIDE = 5

export class RenderList {
  count = 0
  geom: Float32Array
  color: Uint8Array
  /** Number of leading instances that are background tiles. */
  bgCount = 0

  constructor(capacity = 4096) {
    this.geom = new Float32Array(capacity * GEOM_STRIDE)
    this.color = new Uint8Array(capacity * 4)
  }

  reset(capacity: number): void {
    this.count = 0
    this.bgCount = 0
    if (this.color.length < capacity * 4) {
      const cap = Math.ceil(capacity * 1.5)
      this.geom = new Float32Array(cap * GEOM_STRIDE)
      this.color = new Uint8Array(cap * 4)
    }
  }

  private grow(): void {
    const cap = Math.ceil((this.color.length / 4) * 2)
    const g = new Float32Array(cap * GEOM_STRIDE)
    g.set(this.geom)
    const c = new Uint8Array(cap * 4)
    c.set(this.color)
    this.geom = g
    this.color = c
  }

  push(x: number, y: number, glyph: number, scale: number, rot: number, r: number, g: number, b: number, a: number): void {
    if (a <= 0 || scale <= 0) return
    if (this.count * 4 >= this.color.length) this.grow()
    const o = this.count * GEOM_STRIDE
    const geom = this.geom
    geom[o] = x
    geom[o + 1] = y
    geom[o + 2] = scale
    geom[o + 3] = rot
    geom[o + 4] = glyph
    const c = this.count * 4
    const col = this.color
    col[c] = r
    col[c + 1] = g
    col[c + 2] = b
    col[c + 3] = a > 255 ? 255 : a
    this.count++
  }
}

export interface Layout {
  cols: number
  rows: number
  /** Cell size in CSS px. */
  cellW: number
  cellH: number
  fontSize: number
  weight: number
  /** Padding around the art, in cells. */
  pad: number
  /** Device pixels per CSS pixel. */
  pixelRatio: number
}

export function layoutSize(l: Layout): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round((l.cols + 2 * l.pad) * l.cellW * l.pixelRatio)),
    height: Math.max(1, Math.round((l.rows + 2 * l.pad) * l.cellH * l.pixelRatio)),
  }
}

/** Largest pixel ratio ≤ wanted that keeps the canvas within size limits. */
export function fitPixelRatio(l: Layout, wanted: number, maxDim = 8192, maxArea = 16_000_000): number {
  const w = (l.cols + 2 * l.pad) * l.cellW
  const h = (l.rows + 2 * l.pad) * l.cellH
  let pr = wanted
  pr = Math.min(pr, maxDim / w, maxDim / h)
  pr = Math.min(pr, Math.sqrt(maxArea / (w * h)))
  return Math.max(0.05, pr)
}

export type RGBA = [number, number, number, number]
export type Blend = 'normal' | 'add'

export interface Renderer {
  readonly kind: 'webgl2' | 'canvas2d'
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  setLayout(l: Layout): void
  render(list: RenderList, bg: RGBA, blend?: Blend): void
  dispose(): void
}
