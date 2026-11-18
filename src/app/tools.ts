import { rgbToHex } from '../engine/color'
import { cellMetrics } from '../engine/convert'
import { isBlank } from '../engine/types'
import { useApp, type LayerMeta, type Tool } from '../state/store'
import { Stroke, boardToLayer, ensureMask, type BrushPoint } from './brush'
import { addPaintLayer, commitLayers, selectLayer, updateLayer } from './doc'
import type { CellEdit } from './edits'
import { history } from './history'
import { runtimes } from './runtime'
import { glyphRedo, glyphUndo } from './sources'
import { studio } from './studio'

/** Pseudo layer id for the glyph layer that always sits on top. */
export const GLYPH_LAYER = '__glyphs'

export interface BoardPointer {
  clientX: number
  clientY: number
  pressure: number
  pointerType: string
  altKey: boolean
  shiftKey: boolean
}

let stroke: { s: Stroke; layerId: string } | null = null
let drag: { id: string; bx: number; by: number; ox: number; oy: number; before: LayerMeta[] } | null = null
let glyphLast: { x: number; y: number } | null = null
let glyphErase = false
let pickReturn: Tool = 'brush'
let typeStartX = 0

const now = () => performance.now() / 1000

function pressureOf(e: BoardPointer): number {
  return e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.5) : 1
}

function point(e: BoardPointer): BrushPoint | null {
  const b = studio.clientToBoard(e.clientX, e.clientY)
  return b ? { x: b.x, y: b.y, p: pressureOf(e) } : null
}

function touched(rtId: string): () => void {
  return () => {
    const rt = runtimes.get(rtId)
    if (rt) rt.version++
    studio.invalidate('composite')
  }
}

// ---------------------------------------------------------------------------
// hit testing
// ---------------------------------------------------------------------------

/** Topmost visible layer under a board point (transparent pixels let clicks through). */
export function hitLayer(bx: number, by: number): LayerMeta | null {
  const layers = useApp.getState().layers
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]
    if (!l.visible) continue
    const q = boardToLayer(l, { width: l.width, height: l.height }, bx, by)
    if (q.x < 0 || q.y < 0 || q.x > l.width || q.y > l.height) continue
    const rt = runtimes.get(l.id)
    const el = rt?.el
    if (el instanceof HTMLCanvasElement) {
      try {
        const px = Math.floor((q.x / l.width) * el.width)
        const py = Math.floor((q.y / l.height) * el.height)
        const a = el.getContext('2d')!.getImageData(px, py, 1, 1).data[3]
        if (a < 12) continue
      } catch {
        /* treat as hit */
      }
    }
    return l
  }
  return null
}

// ---------------------------------------------------------------------------
// brush + eraser
// ---------------------------------------------------------------------------

function beginStroke(e: BoardPointer, erase: boolean): boolean {
  const s = useApp.getState()
  const pt = point(e)
  if (!pt || !s.board) return false
  if (erase && s.activeLayer === GLYPH_LAYER) return beginGlyph(e, true)
  let layer = s.layers.find((l) => l.id === s.activeLayer) ?? null
  if (!erase) {
    const wantTint = s.brush.ink ? 'ink' : 'none'
    if (!layer || layer.kind !== 'paint' || (layer.tint === 'ink' && wantTint === 'none')) {
      const n = s.layers.filter((l) => l.kind === 'paint').length + 1
      const id = addPaintLayer(wantTint === 'ink' ? `Paint ${n}` : `Color paint ${n}`, wantTint)
      layer = useApp.getState().layers.find((l) => l.id === id)!
    }
  }
  if (!layer) {
    s.toast('Select a layer to erase from.')
    return false
  }
  const rt = runtimes.get(layer.id)
  if (!rt) return false
  let target: HTMLCanvasElement
  if (layer.kind === 'paint' && rt.paint) target = rt.paint
  else if (erase) {
    target = ensureMask(rt)
    if (!layer.hasMask) updateLayer(layer.id, { hasMask: true }, false)
  } else return false
  const b = s.brush
  const color = layer.tint === 'ink' ? '#ffffff' : b.ink ? studio.inkFill() : b.color
  const restore = erase && e.altKey && layer.kind !== 'paint'
  const st = new Stroke(target, layer, {
    size: b.size,
    hardness: b.hardness,
    flow: b.flow,
    color,
    pressure: b.pressure,
    smoothing: b.smoothing,
    mode: erase ? (restore ? 'restore' : 'erase') : 'paint',
  })
  st.begin(pt)
  stroke = { s: st, layerId: layer.id }
  touched(layer.id)()
  return true
}

// ---------------------------------------------------------------------------
// glyph stamping + typing
// ---------------------------------------------------------------------------

function inBounds(x: number, y: number): boolean {
  const f = studio.frame
  return !!f && x >= 0 && y >= 0 && x < f.cols && y < f.rows
}

function glyphEdit(): CellEdit {
  const g = useApp.getState().glyph
  const ch = g.char.codePointAt(0) ?? 35
  if (g.colorMode === 'paint') {
    const n = parseInt(g.color.slice(1), 16)
    return { ch, r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 }
  }
  return { ch, r: 0, g: 0, b: 0, a: -1 }
}

function footprint(x: number, y: number, size: number, fn: (x: number, y: number) => void): void {
  const st = useApp.getState().style
  const { w, h } = cellMetrics(st)
  const fh = Math.max(1, Math.round(size * (w / h)))
  const x0 = x - Math.floor((size - 1) / 2)
  const y0 = y - Math.floor((fh - 1) / 2)
  for (let yy = y0; yy < y0 + fh; yy++) for (let xx = x0; xx < x0 + size; xx++) if (inBounds(xx, yy)) fn(xx, yy)
}

function line(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void): void {
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (let guard = 0; guard < 10000; guard++) {
    fn(x0, y0)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
}

function stampGlyph(x: number, y: number): void {
  const size = glyphErase ? Math.max(1, Math.round(useApp.getState().brush.size / 24)) : useApp.getState().glyph.size
  const e = glyphEdit()
  footprint(x, y, size, (xx, yy) => studio.edits.set(xx, yy, glyphErase ? undefined : e))
}

function beginGlyph(e: BoardPointer, erase: boolean): boolean {
  const c = studio.clientToCell(e.clientX, e.clientY)
  if (!c || !studio.frame) return false
  glyphErase = erase
  const x = Math.floor(c.x)
  const y = Math.floor(c.y)
  studio.edits.begin()
  stampGlyph(x, y)
  glyphLast = { x, y }
  studio.applyEdits()
  return true
}

function finishGlyph(): void {
  if (studio.edits.end()) history.push({ label: 'Glyphs', undo: glyphUndo, redo: glyphRedo })
  studio.syncEdits()
  glyphLast = null
}

export function typeText(text: string): void {
  const cur = studio.typeCursor
  const f = studio.frame
  if (!cur || !f) return
  studio.edits.begin()
  const base = glyphEdit()
  for (const ch of text) {
    if (ch === '\n') {
      cur.y = Math.min(f.rows - 1, cur.y + 1)
      cur.x = typeStartX
      continue
    }
    studio.edits.set(cur.x, cur.y, { ...base, ch: ch.codePointAt(0)! })
    cur.x++
    if (cur.x >= f.cols) {
      cur.x = typeStartX
      cur.y = Math.min(f.rows - 1, cur.y + 1)
    }
  }
  finishGlyph()
  studio.applyEdits()
}

export function typeKey(key: string): boolean {
  const cur = studio.typeCursor
  const f = studio.frame
  if (!cur || !f) return false
  switch (key) {
    case 'Backspace':
      cur.x = Math.max(0, cur.x - 1)
      studio.edits.begin()
      studio.edits.set(cur.x, cur.y, undefined)
      finishGlyph()
      studio.applyEdits()
      return true
    case 'Enter':
      cur.y = Math.min(f.rows - 1, cur.y + 1)
      cur.x = typeStartX
      break
    case 'ArrowLeft':
      cur.x = Math.max(0, cur.x - 1)
      break
    case 'ArrowRight':
      cur.x = Math.min(f.cols - 1, cur.x + 1)
      break
    case 'ArrowUp':
      cur.y = Math.max(0, cur.y - 1)
      break
    case 'ArrowDown':
      cur.y = Math.min(f.rows - 1, cur.y + 1)
      break
    case 'Escape':
      studio.typeCursor = null
      break
    default:
      return false
  }
  studio.invalidate('render')
  return true
}

// ---------------------------------------------------------------------------
// pick
// ---------------------------------------------------------------------------

function pick(e: BoardPointer): void {
  const s = useApp.getState()
  const b = studio.clientToBoard(e.clientX, e.clientY)
  const c = studio.clientToCell(e.clientX, e.clientY)
  if (!b || !c || !s.board) return
  const q = studio.compositeScale
  const px = studio.composite.getContext('2d')!.getImageData(Math.floor(b.x * q), Math.floor(b.y * q), 1, 1).data
  const f = studio.frame
  let char = s.glyph.char
  let color = rgbToHex(px[0], px[1], px[2])
  if (f && inBounds(Math.floor(c.x), Math.floor(c.y))) {
    const i = Math.floor(c.y) * f.cols + Math.floor(c.x)
    if (!isBlank(f.chars[i])) char = String.fromCodePoint(f.chars[i])
    if (px[3] < 10) color = rgbToHex(f.fg[i * 4], f.fg[i * 4 + 1], f.fg[i * 4 + 2])
  }
  s.setBrush({ color, ink: false })
  s.setGlyph({ char, color, colorMode: 'paint' })
  s.setTool(pickReturn)
  s.toast(`Picked ${color.toUpperCase()} and “${char}”`)
}

// ---------------------------------------------------------------------------
// routing
// ---------------------------------------------------------------------------

export function rememberToolForPick(t: Tool): void {
  if (t !== 'pick') pickReturn = t
}

/** Returns true when the board consumed the pointer (capture it). */
export function boardDown(e: BoardPointer): boolean {
  const s = useApp.getState()
  if (!s.board || !studio.frame) return false
  switch (s.tool) {
    case 'interact': {
      const c = studio.clientToCell(e.clientX, e.clientY)
      if (c) studio.pointer.press(c.x, c.y, now())
      studio.invalidate('render')
      return true
    }
    case 'move': {
      const b = studio.clientToBoard(e.clientX, e.clientY)
      if (!b) return false
      const hit = hitLayer(b.x, b.y)
      if (!hit) {
        selectLayer(null)
        return false
      }
      selectLayer(hit.id)
      drag = { id: hit.id, bx: b.x, by: b.y, ox: hit.x, oy: hit.y, before: s.layers }
      return true
    }
    case 'brush':
      return beginStroke(e, false)
    case 'eraser':
      return beginStroke(e, true)
    case 'glyph':
      return beginGlyph(e, e.altKey)
    case 'text': {
      const c = studio.clientToCell(e.clientX, e.clientY)
      if (!c) return false
      const x = Math.floor(c.x)
      const y = Math.floor(c.y)
      if (inBounds(x, y)) {
        studio.typeCursor = { x, y }
        typeStartX = x
        studio.invalidate('render')
      }
      return true
    }
    case 'pick':
      pick(e)
      return true
    default:
      return false
  }
}

export function boardMove(e: BoardPointer): void {
  const s = useApp.getState()
  if (s.tool === 'interact') {
    const c = studio.clientToCell(e.clientX, e.clientY)
    if (c) studio.pointer.move(c.x, c.y, now())
    studio.invalidate('render')
    return
  }
  if (stroke) {
    const pt = point(e)
    if (pt) stroke.s.move(pt)
    touched(stroke.layerId)()
    return
  }
  if (drag) {
    const b = studio.clientToBoard(e.clientX, e.clientY)
    if (!b) return
    let dx = b.x - drag.bx
    let dy = b.y - drag.by
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0
      else dx = 0
    }
    updateLayer(drag.id, { x: drag.ox + dx, y: drag.oy + dy }, false)
    return
  }
  if (glyphLast) {
    const c = studio.clientToCell(e.clientX, e.clientY)
    if (!c) return
    const x = Math.floor(c.x)
    const y = Math.floor(c.y)
    if (x === glyphLast.x && y === glyphLast.y) return
    line(glyphLast.x, glyphLast.y, x, y, stampGlyph)
    glyphLast = { x, y }
    studio.applyEdits()
  }
}

export function boardUp(e: BoardPointer | null): void {
  studio.pointer.release()
  if (stroke) {
    const { s: st, layerId } = stroke
    stroke = null
    const entry = st.end(e ? point(e) : null, touched(layerId))
    if (entry) history.push(entry)
    touched(layerId)()
  }
  if (drag) {
    commitLayers('Move layer', drag.before)
    drag = null
  }
  if (glyphLast) finishGlyph()
}

export function boardLeave(): void {
  studio.pointer.leave()
  studio.invalidate('render')
}

export function undo(): void {
  history.undo()
  studio.invalidate('composite')
}

export function redo(): void {
  history.redo()
  studio.invalidate('composite')
}
