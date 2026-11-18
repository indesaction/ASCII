import type { CellEdit } from '../app/edits'
import { openText, setCanvasSource } from '../app/sources'
import { studio } from '../app/studio'
import { DEFAULT_MOTION, DEFAULT_SHAPE, DEFAULT_STYLE, DEFAULT_TEXT, useApp, type SourceKind, type TextSettings } from '../state/store'
import type { MotionSettings, ShapeSettings, StyleSettings } from '../engine/types'

interface ProjectFile {
  app: 'ascii-atelier'
  version: 1
  title: string
  shape: ShapeSettings
  style: StyleSettings
  motion: MotionSettings
  text: TextSettings
  edits: [number, number, CellEdit][]
  source: { kind: SourceKind; name: string; mask: boolean; image?: string } | null
}

/** Save everything (settings, source image, hand edits) into one JSON file. */
export function exportProject(): Blob {
  const s = useApp.getState()
  let source: ProjectFile['source'] = null
  if (s.source && studio.source) {
    if (s.source.kind === 'text') {
      source = { kind: 'text', name: s.source.name, mask: true }
    } else {
      const c = studio.snapshot()
      if (c) {
        const image = s.source.hasAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92)
        const kind: SourceKind = s.source.live ? 'image' : s.source.kind
        source = { kind, name: s.source.name, mask: !!studio.source.mask, image }
      }
    }
  }
  const file: ProjectFile = {
    app: 'ascii-atelier',
    version: 1,
    title: s.title,
    shape: s.shape,
    style: s.style,
    motion: s.motion,
    text: s.text,
    edits: studio.edits.entries(),
    source,
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

export async function importProject(json: string): Promise<void> {
  let p: ProjectFile
  try {
    p = JSON.parse(json) as ProjectFile
  } catch {
    throw new Error('This is not a valid project file.')
  }
  if (p.app !== 'ascii-atelier') throw new Error('This JSON is not an ASCII Atelier project.')
  useApp.setState({
    shape: { ...DEFAULT_SHAPE, ...p.shape },
    style: { ...DEFAULT_STYLE, ...p.style },
    motion: { ...DEFAULT_MOTION, ...p.motion },
    text: { ...DEFAULT_TEXT, ...p.text },
  })
  if (p.source?.kind === 'text') {
    await openText()
  } else if (p.source?.image) {
    const img = new Image()
    img.src = p.source.image
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d')!.drawImage(img, 0, 0)
    setCanvasSource(c, p.source.kind, p.source.name, p.source.mask)
  }
  useApp.setState({ title: p.title || 'Untitled' })
  studio.edits.load(Array.isArray(p.edits) ? p.edits : [])
  studio.applyEdits()
  studio.syncEdits()
  studio.invalidate(true)
  useApp.getState().toast('Project opened', 'success')
}
