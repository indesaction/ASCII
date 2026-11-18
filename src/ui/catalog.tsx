import type { ReactNode } from 'react'
import type { Tool } from '../state/store'
import { I } from './icons'

/** Tools, in rail order. `group` splits the rail into: play · arrange · paint · type · utility. */
export const TOOLS: { id: Tool; name: string; key: string; icon: ReactNode; group: number; hint: string }[] = [
  { id: 'interact', name: 'Interact', key: 'P', icon: <I.Sparkle />, group: 0, hint: 'Touch the art and it reacts' },
  { id: 'move', name: 'Move', key: 'V', icon: <I.Move />, group: 1, hint: 'Drag to move · corners scale · top handle rotates' },
  { id: 'brush', name: 'Brush', key: 'B', icon: <I.Brush />, group: 2, hint: '[ and ] change the size' },
  { id: 'eraser', name: 'Eraser', key: 'E', icon: <I.Eraser />, group: 2, hint: 'Hold Alt to restore' },
  { id: 'glyph', name: 'Glyph', key: 'G', icon: <I.Stamp />, group: 3, hint: 'Alt-drag removes glyphs' },
  { id: 'text', name: 'Type', key: 'T', icon: <I.Text />, group: 3, hint: 'Click a cell, then type' },
  { id: 'pick', name: 'Pick', key: 'I', icon: <I.Dropper />, group: 4, hint: 'Tap the board to pick a color and a glyph' },
  { id: 'hand', name: 'Pan', key: 'H', icon: <I.Hand />, group: 4, hint: 'Drag to look around when zoomed in' },
]
