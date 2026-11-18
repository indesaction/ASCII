import { getAnimation } from '../anim/animations'
import { LOOKS } from '../engine/presets'
import { useApp } from '../state/store'

/** Apply a look preset: shape, style and (optionally) motion in one step. */
export function applyLook(id: string): void {
  const look = LOOKS.find((l) => l.id === id)
  if (!look) return
  const s = useApp.getState()
  if (look.shape) s.setShape(look.shape)
  if (look.style) s.setStyle({ cellTint: 0, ...look.style })
  if (look.motion) {
    const anim = look.motion.animation
    s.setMotion({ ...look.motion, ...(anim ? { duration: getAnimation(anim).duration, playing: true } : {}) })
  }
}
