import { useApp, type LayerMeta } from '../state/store'

export interface HistoryEntry {
  label: string
  undo(): void
  redo(): void
}

/** One undo stack for everything on the board: strokes, glyphs and layer changes. */
class History {
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []

  push(e: HistoryEntry): void {
    this.past.push(e)
    if (this.past.length > 80) this.past.shift()
    this.future = []
    this.sync()
  }

  undo(): void {
    const e = this.past.pop()
    if (!e) return
    e.undo()
    this.future.push(e)
    this.sync()
  }

  redo(): void {
    const e = this.future.pop()
    if (!e) return
    e.redo()
    this.past.push(e)
    this.sync()
  }

  clear(): void {
    this.past = []
    this.future = []
    this.sync()
  }

  private sync(): void {
    const canUndo = this.past.length > 0
    const canRedo = this.future.length > 0
    const h = useApp.getState().history
    if (h.canUndo !== canUndo || h.canRedo !== canRedo) useApp.setState({ history: { canUndo, canRedo } })
  }
}

export const history = new History()

/** Record a change to the layer list (add, remove, reorder, properties) as one undo step. */
export function recordLayers(label: string, before: LayerMeta[], after: LayerMeta[], activeBefore: string | null, activeAfter: string | null): void {
  history.push({
    label,
    undo: () => useApp.setState({ layers: before, activeLayer: activeBefore }),
    redo: () => useApp.setState({ layers: after, activeLayer: activeAfter }),
  })
}
