/**
 * Small, self-contained ASCII renders that reuse the real engine: the welcome
 * plate and the live look previews. Uses Canvas2D so it never competes with the
 * board's WebGL context.
 */
import { prepareFrame } from '../anim/animations'
import { composeFrame, type ComposeParams } from '../anim/compose'
import { hexToRgb } from '../engine/color'
import { cellMetrics, convert } from '../engine/convert'
import { buildRamp, charsetString } from '../engine/ramp'
import type { AsciiFrame, ShapeSettings, SourceFrame, StyleSettings } from '../engine/types'
import { Canvas2DRenderer, RenderList, type Layout, type RGBA } from '../render'

export interface MiniArt {
  frame: AsciiFrame
  prep: ReturnType<typeof prepareFrame>
  layout: Layout
  bg: RGBA
  aspect: number
  glyphs: number
}

export function buildMini(src: SourceFrame, shape: ShapeSettings, style: StyleSettings, pixelRatio: number): MiniArt {
  const frame = convert(src, shape, style)
  const ramp = buildRamp(charsetString(shape), style.weight, shape.keepOrder)
  const prep = prepareFrame(frame, ramp.chars, Array.from(ramp.chars))
  const { w, h } = cellMetrics(style)
  const [r, g, b] = hexToRgb(style.background)
  let glyphs = 0
  for (let i = 0; i < prep.blank.length; i++) glyphs += prep.blank[i] ? 0 : 1
  return {
    frame,
    prep,
    layout: { cols: frame.cols, rows: frame.rows, cellW: w, cellH: h, fontSize: style.fontSize, weight: style.weight, pad: style.padding, pixelRatio },
    bg: [r, g, b, 255],
    aspect: w / h,
    glyphs,
  }
}

const list = new RenderList()
const renderers = new WeakMap<HTMLCanvasElement, Canvas2DRenderer>()

/** Draw one moment of a mini artwork into `canvas` (still unless `o.animation` is set). */
export function paintMini(canvas: HTMLCanvasElement, art: MiniArt, time = 0, o: Partial<ComposeParams> = {}): void {
  let r = renderers.get(canvas)
  if (!r) {
    r = new Canvas2DRenderer(canvas)
    renderers.set(canvas, r)
  }
  r.setLayout(art.layout)
  composeFrame(list, art.frame, art.prep, time, {
    animation: 'none',
    intensity: 0.7,
    duration: 4,
    highlight: [255, 255, 255],
    background: [art.bg[0], art.bg[1], art.bg[2]],
    aspect: art.aspect,
    still: !o.animation,
    ...o,
  })
  r.render(list, art.bg)
}
