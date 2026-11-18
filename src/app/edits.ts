import type { AsciiFrame } from '../engine/types'
import { cloneFrame } from '../engine/types'

/** A per-cell override. `ch < 0` keeps the generated glyph, `a < 0` keeps its color. */
export interface CellEdit {
  ch: number
  r: number
  g: number
  b: number
  a: number
}

type Change = { key: number; before: CellEdit | undefined; after: CellEdit | undefined }

export const cellKey = (x: number, y: number) => y * 4096 + x

/**
 * Edits live in an overlay on top of the generated ASCII, so you can keep
 * tweaking conversion settings without losing hand-made changes.
 */
export class EditLayer {
  readonly map = new Map<number, CellEdit>()
  private undoStack: Change[][] = []
  private redoStack: Change[][] = []
  private stroke: Map<number, Change> | null = null

  get size(): number {
    return this.map.size
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  begin(): void {
    this.stroke = new Map()
  }

  /** Revert everything changed in the current stroke (used for live line/rect previews). */
  rewindStroke(): void {
    if (!this.stroke) return
    for (const c of this.stroke.values()) this.write(c.key, c.before)
    this.stroke.clear()
  }

  end(): void {
    if (!this.stroke) return
    const changes = [...this.stroke.values()].filter((c) => !same(c.before, c.after))
    this.stroke = null
    if (changes.length) {
      this.undoStack.push(changes)
      if (this.undoStack.length > 200) this.undoStack.shift()
      this.redoStack = []
    }
  }

  get(x: number, y: number): CellEdit | undefined {
    return this.map.get(cellKey(x, y))
  }

  set(x: number, y: number, e: CellEdit | undefined): void {
    const key = cellKey(x, y)
    const before = this.map.get(key)
    if (this.stroke) {
      const c = this.stroke.get(key)
      if (c) c.after = e
      else this.stroke.set(key, { key, before, after: e })
    }
    this.write(key, e)
  }

  private write(key: number, e: CellEdit | undefined): void {
    if (e) this.map.set(key, e)
    else this.map.delete(key)
  }

  undo(): boolean {
    const changes = this.undoStack.pop()
    if (!changes) return false
    for (const c of changes) this.write(c.key, c.before)
    this.redoStack.push(changes)
    return true
  }

  redo(): boolean {
    const changes = this.redoStack.pop()
    if (!changes) return false
    for (const c of changes) this.write(c.key, c.after)
    this.undoStack.push(changes)
    return true
  }

  clear(): void {
    if (this.map.size === 0) return
    const changes: Change[] = [...this.map.entries()].map(([key, before]) => ({ key, before, after: undefined }))
    this.map.clear()
    this.undoStack.push(changes)
    this.redoStack = []
  }

  /** Replace all edits (e.g. when loading a project). */
  load(entries: [number, number, CellEdit][]): void {
    this.map.clear()
    this.undoStack = []
    this.redoStack = []
    for (const [x, y, e] of entries) this.map.set(cellKey(x, y), e)
  }

  entries(): [number, number, CellEdit][] {
    return [...this.map.entries()].map(([k, e]) => [k % 4096, Math.floor(k / 4096), e])
  }

  apply(base: AsciiFrame): AsciiFrame {
    if (this.map.size === 0) return base
    const f = cloneFrame(base)
    for (const [key, e] of this.map) {
      const x = key % 4096
      const y = Math.floor(key / 4096)
      if (x >= f.cols || y >= f.rows) continue
      const i = y * f.cols + x
      if (e.ch >= 0) {
        f.chars[i] = e.ch
        if (f.fg[i * 4 + 3] === 0) f.fg[i * 4 + 3] = 255
      }
      if (e.a >= 0) {
        f.fg[i * 4] = e.r
        f.fg[i * 4 + 1] = e.g
        f.fg[i * 4 + 2] = e.b
        f.fg[i * 4 + 3] = e.a
      }
    }
    return f
  }
}

function same(a: CellEdit | undefined, b: CellEdit | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.ch === b.ch && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
}
