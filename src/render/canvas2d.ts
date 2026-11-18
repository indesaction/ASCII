import { drawGlyph, fontString } from './atlas'
import { type Blend, GEOM_STRIDE, type Layout, type RGBA, type RenderList, type Renderer, glyphs, layoutSize } from './list'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Straightforward fillText renderer: used as WebGL fallback and for exports. */
export class Canvas2DRenderer implements Renderer {
  readonly kind = 'canvas2d' as const
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  private ctx: Ctx2D
  private layout: Layout | null = null

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d') as Ctx2D | null
    if (!ctx) throw new Error('Canvas 2D is not available')
    this.ctx = ctx
  }

  setLayout(l: Layout): void {
    this.layout = l
    const { width, height } = layoutSize(l)
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
  }

  render(list: RenderList, bg: RGBA, blend: Blend = 'normal'): void {
    const l = this.layout
    if (!l) return
    const ctx = this.ctx
    const pr = l.pixelRatio
    const cw = l.cellW * pr
    const ch = l.cellH * pr
    const fontPx = l.fontSize * pr
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (bg[3] > 0) {
      ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},${bg[3] / 255})`
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }
    ctx.font = fontString(l.weight, fontPx)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const { geom, color } = list
    const codes = glyphs.codes
    const strings = glyphs.strings
    let last = -1
    for (let i = 0; i < list.count; i++) {
      if (i === list.bgCount) ctx.globalCompositeOperation = blend === 'add' ? 'lighter' : 'source-over'
      const c = i * 4
      const key = (color[c] << 24) | (color[c + 1] << 16) | (color[c + 2] << 8) | color[c + 3]
      if (key !== last) {
        ctx.fillStyle = `rgba(${color[c]},${color[c + 1]},${color[c + 2]},${color[c + 3] / 255})`
        last = key
      }
      const o = i * GEOM_STRIDE
      const s = geom[o + 2]
      const r = geom[o + 3]
      const gi = geom[o + 4]
      const cx = (geom[o] + l.pad + 0.5) * cw
      const cy = (geom[o + 1] + l.pad + 0.5) * ch
      if (s === 1 && r === 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        drawGlyph(ctx, codes[gi], strings[gi], cx, cy, cw, ch, fontPx)
      } else {
        const cs = Math.cos(r) * s
        const sn = Math.sin(r) * s
        ctx.setTransform(cs, sn, -sn, cs, cx, cy)
        drawGlyph(ctx, codes[gi], strings[gi], 0, 0, cw, ch, fontPx)
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
  }

  dispose(): void {}
}
