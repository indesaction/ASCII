import { proofRgb } from '../engine/color'
import { FULL_BLOCK } from '../engine/glyphs'
import type { AsciiFrame, RGB } from '../engine/types'
import { RenderList, glyphs } from '../render/list'
import { applyMagnet, emitStatic, getAnimation, type AnimCtx, type prepareFrame } from './animations'

export type Prepared = ReturnType<typeof prepareFrame>

export interface ComposeParams {
  animation: string
  intensity: number
  /** Loop length in animation-time seconds. */
  duration: number
  highlight: RGB
  background: RGB
  /** Cell width / height. */
  aspect: number
  /** Render the still image even if an animation is selected. */
  still?: boolean
  magnet?: { x: number; y: number; strength: number } | null
  cursor?: { x: number; y: number; color: RGB } | null
  proof?: boolean
}

/** Build the instance list for one moment of an animation. */
export function composeFrame(list: RenderList, frame: AsciiFrame, prep: Prepared, time: number, o: ComposeParams): void {
  const anim = getAnimation(o.still ? 'none' : o.animation)
  const duration = Math.max(0.25, o.duration)
  const ctx: AnimCtx = {
    f: frame,
    gi: prep.gi,
    blank: prep.blank,
    out: list,
    p: (((time / duration) % 1) + 1) % 1,
    time,
    intensity: o.intensity,
    hl: o.highlight,
    bg: o.background,
    pool: prep.pool,
    ramp: prep.ramp,
    rampPos: prep.rampPos,
    aspect: o.aspect,
  }
  list.reset(frame.cols * frame.rows * 2 + 16)
  if (o.still) emitStatic(ctx)
  else anim.run(ctx)
  if (o.cursor) {
    const [r, g, b] = o.cursor.color
    list.push(o.cursor.x, o.cursor.y, glyphs.index(FULL_BLOCK), 1, 0, r, g, b, 150)
  }
  if (o.magnet) applyMagnet(list, o.magnet.x, o.magnet.y, o.aspect, o.magnet.strength, o.highlight)
  if (o.proof) {
    const c = list.color
    for (let i = 0; i < list.count; i++) {
      const k = i * 4
      const p = proofRgb(c[k], c[k + 1], c[k + 2])
      c[k] = p[0]
      c[k + 1] = p[1]
      c[k + 2] = p[2]
    }
  }
}

export function blendFor(animation: string, still = false): 'normal' | 'add' {
  return still ? 'normal' : (getAnimation(animation).blend ?? 'normal')
}
