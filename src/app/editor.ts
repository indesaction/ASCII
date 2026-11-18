import { hexToRgb, rgbToHex } from '../engine/color'
import { cellMetrics } from '../engine/convert'
import { buildRamp, charsetString, nearestLevel } from '../engine/ramp'
import { isBlank } from '../engine/types'
import { useApp } from '../state/store'
import type { CellEdit } from './edits'
import { studio } from './studio'

let active = false
let start: { x: number; y: number } | null = null
let last: { x: number; y: number } | null = null
let invertShade = false
const touched = new Set<number>()
let typeStartX = 0

function refresh(): void {
  studio.applyEdits()
  studio.invalidate(false)
  studio.syncEdits()
}

function brushEdit(kind: 'brush' | 'erase' | 'recolor'): CellEdit {
  const ed = useApp.getState().editor
  const cp = kind === 'erase' ? 32 : kind === 'recolor' ? -1 : (ed.char.codePointAt(0) ?? 35)
  if (kind === 'recolor' || (kind === 'brush' && ed.colorMode === 'paint')) {
    const [r, g, b] = hexToRgb(ed.color)
    return { ch: cp, r, g, b, a: 255 }
  }
  return { ch: cp, r: 0, g: 0, b: 0, a: -1 }
}

function inBounds(x: number, y: number): boolean {
  const f = studio.frame
  return !!f && x >= 0 && y >= 0 && x < f.cols && y < f.rows
}

function put(x: number, y: number, e: CellEdit): void {
  if (!inBounds(x, y)) return
  const prev = studio.edits.get(x, y)
  const next: CellEdit = {
    ch: e.ch >= 0 ? e.ch : (prev?.ch ?? -1),
    r: e.a >= 0 ? e.r : (prev?.r ?? 0),
    g: e.a >= 0 ? e.g : (prev?.g ?? 0),
    b: e.a >= 0 ? e.b : (prev?.b ?? 0),
    a: e.a >= 0 ? e.a : (prev?.a ?? -1),
  }
  studio.edits.set(x, y, next.ch < 0 && next.a < 0 ? undefined : next)
}

function footprint(x: number, y: number, fn: (x: number, y: number) => void): void {
  const s = useApp.getState()
  const size = s.editor.size
  const { w, h } = cellMetrics(s.style)
  const fw = size
  const fh = Math.max(1, Math.round(size * (w / h)))
  const x0 = x - Math.floor((fw - 1) / 2)
  const y0 = y - Math.floor((fh - 1) / 2)
  for (let yy = y0; yy < y0 + fh; yy++) for (let xx = x0; xx < x0 + fw; xx++) fn(xx, yy)
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

function shadeCell(x: number, y: number): void {
  if (!inBounds(x, y)) return
  const key = y * 4096 + x
  if (touched.has(key)) return
  touched.add(key)
  const s = useApp.getState()
  const f = studio.frame!
  const ramp = buildRamp(charsetString(s.shape), s.style.weight, s.shape.keepOrder)
  const i = y * f.cols + x
  let pos = ramp.chars.indexOf(f.chars[i])
  if (pos < 0) pos = nearestLevel(ramp.density, f.ink[i])
  const dir = s.editor.shadeDir * (invertShade ? -1 : 1)
  const np = Math.max(0, Math.min(ramp.chars.length - 1, pos + dir))
  put(x, y, { ch: ramp.chars[np], r: 0, g: 0, b: 0, a: -1 })
}

function stamp(x: number, y: number): void {
  const tool = useApp.getState().editor.tool
  if (tool === 'shade') return footprint(x, y, shadeCell)
  const e = brushEdit(tool === 'erase' ? 'erase' : tool === 'recolor' ? 'recolor' : 'brush')
  footprint(x, y, (xx, yy) => put(xx, yy, e))
}

function drawShape(x0: number, y0: number, x1: number, y1: number): void {
  const tool = useApp.getState().editor.tool
  const e = brushEdit('brush')
  const plot = (x: number, y: number) => footprint(x, y, (xx, yy) => put(xx, yy, e))
  if (tool === 'line') {
    line(x0, y0, x1, y1, plot)
  } else {
    line(x0, y0, x1, y0, plot)
    line(x1, y0, x1, y1, plot)
    line(x1, y1, x0, y1, plot)
    line(x0, y1, x0, y0, plot)
  }
}

function floodFill(x: number, y: number): void {
  const f = studio.frame
  if (!f || !inBounds(x, y)) return
  const target = f.chars[y * f.cols + x]
  const e = brushEdit('brush')
  if (e.ch === target && e.a < 0) return
  const seen = new Uint8Array(f.cols * f.rows)
  const stack = [y * f.cols + x]
  let count = 0
  while (stack.length && count < 200000) {
    const i = stack.pop()!
    if (seen[i]) continue
    seen[i] = 1
    if (f.chars[i] !== target) continue
    const cx = i % f.cols
    const cy = (i / f.cols) | 0
    put(cx, cy, e)
    count++
    if (cx > 0) stack.push(i - 1)
    if (cx < f.cols - 1) stack.push(i + 1)
    if (cy > 0) stack.push(i - f.cols)
    if (cy < f.rows - 1) stack.push(i + f.cols)
  }
}

function pickAt(x: number, y: number): void {
  const f = studio.frame
  if (!f || !inBounds(x, y)) return
  const i = y * f.cols + x
  const cp = f.chars[i]
  const color = rgbToHex(f.fg[i * 4], f.fg[i * 4 + 1], f.fg[i * 4 + 2])
  const s = useApp.getState()
  s.setEditor({
    char: isBlank(cp) ? s.editor.char : String.fromCodePoint(cp),
    color,
    colorMode: 'paint',
    tool: 'brush',
  })
  s.toast(`Picked “${isBlank(cp) ? s.editor.char : String.fromCodePoint(cp)}” ${color}`)
}

/** Returns true when the editor consumed the pointer event. */
export function editorDown(clientX: number, clientY: number, alt: boolean): boolean {
  const s = useApp.getState()
  if (s.tab !== 'edit' || s.editor.tool === 'pan' || !studio.frame) return false
  const c = studio.clientToCell(clientX, clientY)
  if (!c) return false
  const x = Math.floor(c.x)
  const y = Math.floor(c.y)
  const tool = s.editor.tool
  invertShade = alt
  if (tool === 'pick') {
    pickAt(x, y)
    return true
  }
  if (tool === 'type') {
    if (inBounds(x, y)) {
      studio.typeCursor = { x, y }
      typeStartX = x
      studio.invalidate(false)
    }
    return true
  }
  studio.edits.begin()
  if (tool === 'fill') {
    floodFill(x, y)
    studio.edits.end()
    refresh()
    return true
  }
  active = true
  touched.clear()
  start = { x, y }
  last = { x, y }
  if (tool === 'line' || tool === 'rect') drawShape(x, y, x, y)
  else stamp(x, y)
  refresh()
  return true
}

export function editorMove(clientX: number, clientY: number): void {
  if (!active || !start || !last) return
  const c = studio.clientToCell(clientX, clientY)
  if (!c) return
  const x = Math.floor(c.x)
  const y = Math.floor(c.y)
  if (x === last.x && y === last.y) return
  const tool = useApp.getState().editor.tool
  if (tool === 'line' || tool === 'rect') {
    studio.edits.rewindStroke()
    drawShape(start.x, start.y, x, y)
  } else {
    line(last.x, last.y, x, y, stamp)
  }
  last = { x, y }
  refresh()
}

export function editorUp(): void {
  if (!active) return
  active = false
  start = null
  last = null
  touched.clear()
  studio.edits.end()
  studio.syncEdits()
}

// ---------------------------------------------------------------------------
// typing
// ---------------------------------------------------------------------------

export function typeText(text: string): void {
  const cur = studio.typeCursor
  const f = studio.frame
  if (!cur || !f) return
  studio.edits.begin()
  const base = brushEdit('brush')
  for (const ch of text) {
    if (ch === '\n') {
      cur.y = Math.min(f.rows - 1, cur.y + 1)
      cur.x = typeStartX
      continue
    }
    put(cur.x, cur.y, { ...base, ch: ch.codePointAt(0)! })
    cur.x++
    if (cur.x >= f.cols) {
      cur.x = typeStartX
      cur.y = Math.min(f.rows - 1, cur.y + 1)
    }
  }
  studio.edits.end()
  refresh()
}

export function typeKey(key: string): boolean {
  const cur = studio.typeCursor
  const f = studio.frame
  if (!cur || !f) return false
  switch (key) {
    case 'Backspace':
      cur.x = Math.max(0, cur.x - 1)
      studio.edits.begin()
      put(cur.x, cur.y, { ch: 32, r: 0, g: 0, b: 0, a: -1 })
      studio.edits.end()
      refresh()
      return true
    case 'Delete':
      studio.edits.begin()
      put(cur.x, cur.y, { ch: 32, r: 0, g: 0, b: 0, a: -1 })
      studio.edits.end()
      refresh()
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
  studio.invalidate(false)
  return true
}

export function undo(): void {
  if (studio.edits.undo()) refresh()
}

export function redo(): void {
  if (studio.edits.redo()) refresh()
}

export function clearEdits(): void {
  studio.edits.clear()
  refresh()
}
