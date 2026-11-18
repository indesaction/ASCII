import type { ReactNode } from 'react'
import type { Tool } from '../state/store'
import { I } from './icons'

export const TOOLS: { id: Tool; name: string; key: string; icon: ReactNode }[] = [
  { id: 'brush', name: 'Brush', key: 'B', icon: <I.Brush /> },
  { id: 'type', name: 'Type', key: 'T', icon: <I.Text /> },
  { id: 'erase', name: 'Erase', key: 'E', icon: <I.Eraser /> },
  { id: 'fill', name: 'Fill', key: 'F', icon: <I.Bucket /> },
  { id: 'shade', name: 'Shade', key: 'S', icon: <I.Shade /> },
  { id: 'recolor', name: 'Recolor', key: 'C', icon: <I.Recolor /> },
  { id: 'line', name: 'Line', key: 'L', icon: <I.Line /> },
  { id: 'rect', name: 'Box', key: 'R', icon: <I.Rect /> },
  { id: 'pick', name: 'Pick', key: 'I', icon: <I.Dropper /> },
  { id: 'pan', name: 'View', key: 'V', icon: <I.Hand /> },
]
