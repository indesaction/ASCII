import { blendFor, composeFrame } from '../anim/compose'
import { studio } from '../app/studio'
import { Canvas2DRenderer, RenderList, fitPixelRatio } from '../render'
import { snapshot } from './common'

export interface RasterOptions {
  scale: number
  transparent: boolean
  /** Capture the current animation frame instead of the still image. */
  animationFrame?: boolean
}

export const isIOS =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export function maxCanvasArea(): number {
  return isIOS ? 16_000_000 : 120_000_000
}

export function renderStillCanvas(opts: RasterOptions): HTMLCanvasElement {
  const { frame, prep } = snapshot()
  const layout = studio.layoutFor(frame, 1)
  layout.pixelRatio = fitPixelRatio(layout, opts.scale, 16384, maxCanvasArea())
  const canvas = document.createElement('canvas')
  const r = new Canvas2DRenderer(canvas)
  r.setLayout(layout)
  const list = new RenderList()
  const params = studio.composeParams({ still: !opts.animationFrame })
  composeFrame(list, frame, prep, studio.animTime, params)
  r.render(list, studio.backgroundRGBA(true, opts.transparent), blendFor(params.animation, params.still))
  return canvas
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed (canvas too large?)'))), type, quality),
  )
}

export async function exportPng(opts: RasterOptions): Promise<Blob> {
  return canvasToBlob(renderStillCanvas(opts))
}
