import type { ReactNode } from 'react'
import type { Tool } from '../state/store'
import { I } from './icons'

export const TOOLS: { id: Tool; name: string; key: string; icon: ReactNode }[] = [
  { id: 'interact', name: 'Interact', key: 'P', icon: <I.Sparkle /> },
  { id: 'move', name: 'Move', key: 'V', icon: <I.Move /> },
  { id: 'brush', name: 'Brush', key: 'B', icon: <I.Brush /> },
  { id: 'eraser', name: 'Eraser', key: 'E', icon: <I.Eraser /> },
  { id: 'glyph', name: 'Glyph', key: 'G', icon: <I.Stamp /> },
  { id: 'text', name: 'Type', key: 'T', icon: <I.Text /> },
  { id: 'pick', name: 'Pick', key: 'I', icon: <I.Dropper /> },
  { id: 'hand', name: 'Pan', key: 'H', icon: <I.Hand /> },
]
