import { Canvas2DRenderer } from './canvas2d'
import { GLRenderer } from './gl'
import type { Renderer } from './list'

export * from './list'
export { Canvas2DRenderer } from './canvas2d'
export { GLRenderer } from './gl'

/** WebGL2 when available (fast, smooth animation), otherwise Canvas 2D. */
export function createRenderer(canvas: HTMLCanvasElement | OffscreenCanvas, preferGL = true, preserve = false): Renderer {
  if (preferGL) {
    const gl = GLRenderer.create(canvas, preserve)
    if (gl) return gl
  }
  return new Canvas2DRenderer(canvas)
}
