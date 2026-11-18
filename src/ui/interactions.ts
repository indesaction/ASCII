import type { InteractionMode } from '../engine/types'

export const INTERACTIONS: { id: InteractionMode; name: string; hint: string }[] = [
  { id: 'repel', name: 'Repel', hint: 'Glyphs scatter away from your pointer' },
  { id: 'attract', name: 'Attract', hint: 'Glyphs gather toward your pointer' },
  { id: 'swirl', name: 'Swirl', hint: 'Stir the art like wet paint' },
  { id: 'lens', name: 'Lens', hint: 'A loupe that reveals the original image' },
  { id: 'ripple', name: 'Ripple', hint: 'Tap or drag to send waves through the art' },
  { id: 'burst', name: 'Burst', hint: 'Tap to blow glyphs apart; they spring back' },
  { id: 'spotlight', name: 'Spotlight', hint: 'Light the art only where you point' },
  { id: 'trail', name: 'Trail', hint: 'Leave a glowing comet trail' },
  { id: 'tilt', name: 'Tilt', hint: 'Turn the art in 3D with your pointer' },
  { id: 'off', name: 'Off', hint: 'No pointer effects' },
]
