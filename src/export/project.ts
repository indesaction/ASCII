import { clearBoard } from '../app/doc'
import type { CellEdit } from '../app/edits'
import { history } from '../app/history'
import { makeCanvas, runtimes } from '../app/runtime'
import { renderText } from '../app/sources'
import { studio } from '../app/studio'
import type { InteractionSettings, MotionSettings, ShapeSettings, StyleSettings } from '../engine/types'
import {
  DEFAULT_INTERACTION,
  DEFAULT_MOTION,
  DEFAULT_SHAPE,
  DEFAULT_STYLE,
  DEFAULT_TEXT,
  useApp,
  type Board,
  type LayerMeta,
} from '../state/store'

type SavedLayer = LayerMeta & { image?: string; mask?: string }

interface ProjectFile {
  app: 'ascii-atelier'
  version: 2
  title: string
  shape: ShapeSettings
  style: StyleSettings
  motion: MotionSettings
  interaction: InteractionSettings
  board: Board | null
  layers: SavedLayer[]
  activeLayer: string | null
  glyphsVisible: boolean
  edits: [number, number, CellEdit][]
}

interface ProjectV1 {
  app: 'ascii-atelier'
  version: 1
  title: string
  shape: ShapeSettings
  style: StyleSettings
  motion: MotionSettings
  edits: [number, number, CellEdit][]
  source: { kind: string; name: string; mask: boolean; image?: string } | null
}

function hasAlpha(c: CanvasImageSource): boolean {
  const t = makeCanvas(48, 48)
  const ctx = t.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(c, 0, 0, 48, 48)
  const d = ctx.getImageData(0, 0, 48, 48).data
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true
  return false
}

function snapshot(el: CanvasImageSource, w: number, h: number, mirror = false): HTMLCanvasElement {
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')!
  if (mirror) ctx.setTransform(-1, 0, 0, 1, c.width, 0)
  ctx.drawImage(el, 0, 0, c.width, c.height)
  return c
}

function encode(c: HTMLCanvasElement): string {
  return hasAlpha(c) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92)
}

/** Save everything (settings, layers with their pixels, glyphs) into one JSON file. */
export function exportProject(): Blob {
  const s = useApp.getState()
  const layers: SavedLayer[] = []
  for (const l of s.layers) {
    const rt = runtimes.get(l.id)
    if (!rt) continue
    const still = snapshot(rt.el, rt.width, rt.height, rt.mirror)
    const saved: SavedLayer = { ...l }
    // Media that can't travel in a file is saved as its current frame.
    if (l.kind === 'video' || l.kind === 'camera' || l.kind === 'gif' || l.kind === 'pdf') {
      saved.kind = 'image'
      delete saved.playing
      delete saved.page
      delete saved.pages
    }
    if (l.kind !== 'text') saved.image = encode(still)
    if (rt.mask) saved.mask = rt.mask.toDataURL('image/png')
    layers.push(saved)
  }
  const file: ProjectFile = {
    app: 'ascii-atelier',
    version: 2,
    title: s.title,
    shape: s.shape,
    style: s.style,
    motion: s.motion,
    interaction: s.interaction,
    board: s.board,
    layers,
    activeLayer: s.activeLayer,
    glyphsVisible: s.glyphLayer.visible,
    edits: studio.edits.entries(),
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

async function loadCanvas(url: string): Promise<HTMLCanvasElement> {
  const img = new Image()
  img.src = url
  await img.decode()
  return snapshot(img, img.naturalWidth, img.naturalHeight)
}

export async function importProject(json: string): Promise<void> {
  let p: ProjectFile | ProjectV1
  try {
    p = JSON.parse(json) as ProjectFile | ProjectV1
  } catch {
    throw new Error('This is not a valid project file.')
  }
  if (p.app !== 'ascii-atelier') throw new Error('This JSON is not an ASCII Atelier project.')
  clearBoard()
  useApp.setState({
    shape: { ...DEFAULT_SHAPE, ...p.shape },
    style: { ...DEFAULT_STYLE, ...p.style },
    motion: { ...DEFAULT_MOTION, ...p.motion },
    interaction: { ...DEFAULT_INTERACTION, ...('interaction' in p ? p.interaction : {}) },
  })
  if (p.version === 1) {
    const v1 = p as ProjectV1
    if (v1.source?.image) {
      const c = await loadCanvas(v1.source.image)
      const { addCanvasLayer } = await import('../app/sources')
      addCanvasLayer(c, v1.source.name)
      if (v1.source.mask) useApp.getState().setShape({ alphaInk: true })
    } else if (v1.source?.kind === 'text') {
      const { addText } = await import('../app/sources')
      await addText('top')
    }
  } else {
    const v2 = p as ProjectFile
    const metas: LayerMeta[] = []
    for (const saved of v2.layers) {
      const { image, mask, ...meta } = saved
      let el: HTMLCanvasElement
      if (meta.kind === 'text' && meta.text) el = await renderText({ ...DEFAULT_TEXT, ...meta.text })
      else if (image) el = await loadCanvas(image)
      else continue
      const rt = { el, width: el.width, height: el.height, version: 0, paint: meta.kind === 'paint' ? el : undefined, mask: undefined as HTMLCanvasElement | undefined }
      if (mask) rt.mask = await loadCanvas(mask)
      runtimes.set(meta.id, rt)
      metas.push({ ...meta, width: el.width, height: el.height })
    }
    useApp.setState({
      board: v2.board,
      layers: metas,
      activeLayer: v2.activeLayer ?? metas[metas.length - 1]?.id ?? null,
      glyphLayer: { visible: v2.glyphsVisible ?? true, count: 0 },
    })
  }
  useApp.setState({ title: p.title || 'Untitled' })
  studio.edits.load(Array.isArray(p.edits) ? p.edits : [])
  studio.syncEdits()
  history.clear()
  studio.invalidate('composite')
  useApp.getState().toast('Project opened', 'success')
}
