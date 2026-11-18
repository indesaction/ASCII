import type { LayerMeta } from '../state/store'
import type { HistoryEntry } from './history'
import { makeCanvas, type LayerRuntime } from './runtime'

export interface BrushPoint {
  /** Board pixels. */
  x: number
  y: number
  /** Pen pressure 0..1 (0.5 for mice). */
  p: number
}

export interface StrokeOptions {
  size: number
  hardness: number
  flow: number
  color: string
  pressure: boolean
  smoothing: number
  mode: 'paint' | 'erase' | 'restore'
}

const stamps = new Map<string, HTMLCanvasElement>()

/** A round brush tip: solid core, soft falloff controlled by hardness. */
function stampFor(hardness: number, color: string): HTMLCanvasElement {
  const key = `${hardness.toFixed(2)}|${color}`
  let c = stamps.get(key)
  if (!c) {
    const S = 128
    c = makeCanvas(S, S)
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    const core = Math.min(0.98, Math.max(0, hardness))
    g.addColorStop(0, color)
    g.addColorStop(core, color)
    g.addColorStop(1, color + '00')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2)
    ctx.fill()
    if (stamps.size > 40) stamps.clear()
    stamps.set(key, c)
  }
  return c
}

/** Map a board point into a layer's own pixel space (inverse of its transform). */
export function boardToLayer(l: LayerMeta, target: { width: number; height: number }, x: number, y: number): { x: number; y: number } {
  const dx = x - l.x
  const dy = y - l.y
  const c = Math.cos(-l.rotation)
  const s = Math.sin(-l.rotation)
  const lx = (dx * c - dy * s) / l.scale + l.width / 2
  const ly = (dx * s + dy * c) / l.scale + l.height / 2
  return { x: (lx / l.width) * target.width, y: (ly / l.height) * target.height }
}

/** Create a fully opaque eraser mask for an image-like layer. */
export function ensureMask(rt: LayerRuntime): HTMLCanvasElement {
  if (!rt.mask) {
    const s = Math.min(1, 2048 / Math.max(rt.width, rt.height))
    const m = makeCanvas(rt.width * s, rt.height * s)
    const ctx = m.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, m.width, m.height)
    rt.mask = m
  }
  return rt.mask
}

/**
 * One brush or eraser stroke. Dabs are spaced along a smoothed path so fast
 * strokes stay continuous, and the touched area is snapshotted for undo.
 */
export class Stroke {
  private ctx: CanvasRenderingContext2D
  private before: HTMLCanvasElement
  private sx = 0
  private sy = 0
  private lx = 0
  private ly = 0
  private lastP = 0.5
  private carry = 0
  private minX = Infinity
  private minY = Infinity
  private maxX = -Infinity
  private maxY = -Infinity
  private readonly target: HTMLCanvasElement
  private readonly layer: LayerMeta
  private readonly o: StrokeOptions

  constructor(target: HTMLCanvasElement, layer: LayerMeta, o: StrokeOptions) {
    this.target = target
    this.layer = layer
    this.o = o
    this.ctx = target.getContext('2d')!
    this.before = makeCanvas(target.width, target.height)
    this.before.getContext('2d')!.drawImage(target, 0, 0)
  }

  /** Brush radius in target pixels for a given pressure. */
  private radius(p: number): number {
    const k = this.target.width / this.layer.width / this.layer.scale
    const pr = this.o.pressure ? 0.2 + 0.8 * p : 1
    return Math.max(0.5, (this.o.size / 2) * pr * k)
  }

  begin(pt: BrushPoint): void {
    const q = boardToLayer(this.layer, this.target, pt.x, pt.y)
    this.sx = this.lx = q.x
    this.sy = this.ly = q.y
    this.lastP = pt.p
    this.dab(q.x, q.y, pt.p)
  }

  move(pt: BrushPoint): void {
    const q = boardToLayer(this.layer, this.target, pt.x, pt.y)
    const follow = 1 - Math.min(0.9, this.o.smoothing * 0.9)
    this.sx += (q.x - this.sx) * follow
    this.sy += (q.y - this.sy) * follow
    this.segment(this.sx, this.sy, pt.p)
  }

  /** Catch up to the final pointer position, then return an undo step. */
  end(pt: BrushPoint | null, onChange: () => void): HistoryEntry | null {
    if (pt) {
      const q = boardToLayer(this.layer, this.target, pt.x, pt.y)
      this.segment(q.x, q.y, pt.p)
    }
    if (this.maxX < this.minX) return null
    const x = Math.max(0, Math.floor(this.minX))
    const y = Math.max(0, Math.floor(this.minY))
    const w = Math.min(this.target.width, Math.ceil(this.maxX)) - x
    const h = Math.min(this.target.height, Math.ceil(this.maxY)) - y
    if (w <= 0 || h <= 0) return null
    const beforeData = this.before.getContext('2d')!.getImageData(x, y, w, h)
    const afterData = this.ctx.getImageData(x, y, w, h)
    const target = this.target
    return {
      label: this.o.mode === 'paint' ? 'Brush stroke' : 'Erase',
      undo: () => {
        target.getContext('2d')!.putImageData(beforeData, x, y)
        onChange()
      },
      redo: () => {
        target.getContext('2d')!.putImageData(afterData, x, y)
        onChange()
      },
    }
  }

  private segment(x: number, y: number, p: number): void {
    const dx = x - this.lx
    const dy = y - this.ly
    const dist = Math.hypot(dx, dy)
    let travelled = -this.carry
    while (true) {
      const r = this.radius(this.lastP + (p - this.lastP) * Math.max(0, travelled / (dist || 1)))
      const step = Math.max(0.6, r * 0.16)
      travelled += step
      if (travelled > dist) {
        this.carry = dist - (travelled - step)
        break
      }
      const t = travelled / dist
      this.dab(this.lx + dx * t, this.ly + dy * t, this.lastP + (p - this.lastP) * t)
    }
    this.lx = x
    this.ly = y
    this.lastP = p
  }

  private dab(x: number, y: number, p: number): void {
    const r = this.radius(p)
    const ctx = this.ctx
    const erase = this.o.mode === 'erase'
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    ctx.globalAlpha = Math.min(1, this.o.flow * (this.o.pressure ? 0.35 + 0.65 * p : 1))
    const tip = stampFor(this.o.hardness, erase ? '#000000' : this.o.mode === 'restore' ? '#ffffff' : this.o.color)
    ctx.drawImage(tip, x - r, y - r, r * 2, r * 2)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    if (x - r < this.minX) this.minX = x - r
    if (y - r < this.minY) this.minY = y - r
    if (x + r > this.maxX) this.maxX = x + r
    if (y + r > this.maxY) this.maxY = y + r
  }
}
