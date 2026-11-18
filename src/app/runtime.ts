import type { LayerMeta } from '../state/store'

export interface GifAnimation {
  frames: HTMLCanvasElement[]
  /** Cumulative end time of each frame, in ms. */
  ends: number[]
  total: number
}

/** Non-serializable state of a layer: its pixels and any media behind them. */
export interface LayerRuntime {
  /** Current pixels to draw (canvas, or a playing video). */
  el: CanvasImageSource
  width: number
  height: number
  video?: HTMLVideoElement
  stream?: MediaStream
  mirror?: boolean
  /** Paint layers: the canvas the brush draws into (same object as `el`). */
  paint?: HTMLCanvasElement
  /** Eraser mask for image-like layers: opaque = visible. */
  mask?: HTMLCanvasElement
  gif?: GifAnimation
  pdf?: { render(page: number): Promise<HTMLCanvasElement>; pages: number }
  /** Scratch canvas used while compositing masked or ink-tinted layers. */
  temp?: HTMLCanvasElement
  /** Incremented whenever pixels change (drives thumbnails). */
  version: number
}

export const runtimes = new Map<string, LayerRuntime>()

let counter = 0
export function newLayerId(): string {
  counter++
  return `L${Date.now().toString(36)}${counter.toString(36)}`
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** Whether a layer's pixels change over time (needs continuous compositing). */
export function isLive(meta: LayerMeta, rt: LayerRuntime | undefined): boolean {
  if (!rt || !meta.visible) return false
  if (rt.stream) return true
  if (rt.video) return !rt.video.paused
  if (rt.gif) return meta.playing !== false
  return false
}

export function disposeRuntime(rt: LayerRuntime): void {
  if (rt.stream) for (const t of rt.stream.getTracks()) t.stop()
  if (rt.video) {
    rt.video.pause()
    if (rt.video.src.startsWith('blob:')) URL.revokeObjectURL(rt.video.src)
    rt.video.remove()
  }
}
