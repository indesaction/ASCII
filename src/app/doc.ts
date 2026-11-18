import { useApp, type Board, type LayerKind, type LayerMeta } from '../state/store'
import { history, recordLayers } from './history'
import { disposeRuntime, makeCanvas, newLayerId, runtimes, type LayerRuntime } from './runtime'
import { studio } from './studio'

/** Longest side of a new board created from its first layer. */
const BOARD_MAX = 1600

export type Placement = 'above' | 'below' | 'top'

export function activeLayer(): LayerMeta | null {
  const s = useApp.getState()
  return s.layers.find((l) => l.id === s.activeLayer) ?? null
}

function fitScale(board: Board, w: number, h: number): number {
  return Math.min(board.width / w, board.height / h)
}

/** Create a board sized to the given content aspect. */
export function ensureBoard(w: number, h: number): Board {
  const s = useApp.getState()
  if (s.board) return s.board
  const k = BOARD_MAX / Math.max(w, h)
  const board = { width: Math.round(w * k), height: Math.round(h * k) }
  useApp.setState({ board })
  return board
}

export interface NewLayer {
  kind: LayerKind
  name: string
  extra?: Partial<LayerMeta>
}

/** Add a layer above/below the active one. Returns its id. */
export function addLayer(rt: LayerRuntime, spec: NewLayer, where: Placement = 'above'): string {
  const board = ensureBoard(rt.width, rt.height)
  const s = useApp.getState()
  const id = newLayerId()
  runtimes.set(id, rt)
  const meta: LayerMeta = {
    id,
    name: spec.name,
    kind: spec.kind,
    visible: true,
    opacity: 1,
    blend: 'source-over',
    x: board.width / 2,
    y: board.height / 2,
    scale: fitScale(board, rt.width, rt.height),
    rotation: 0,
    width: rt.width,
    height: rt.height,
    ...spec.extra,
  }
  const before = s.layers
  const layers = [...before]
  const ai = layers.findIndex((l) => l.id === s.activeLayer)
  if (where === 'top' || ai < 0) layers.push(meta)
  else layers.splice(where === 'above' ? ai + 1 : ai, 0, meta)
  // Open the mobile controls for the first layer only; later layers keep the user's choice.
  const sheet = before.length === 0 && s.ui.sheet === 0 ? 1 : s.ui.sheet
  useApp.setState({ layers, activeLayer: id, ui: { ...s.ui, sheet } })
  recordLayers(`Add ${spec.name}`, before, layers, s.activeLayer, id)
  if (s.title === 'Untitled') useApp.setState({ title: spec.name })
  return id
}

export function updateLayer(id: string, patch: Partial<LayerMeta>, record = true): void {
  const s = useApp.getState()
  const before = s.layers
  const layers = before.map((l) => (l.id === id ? { ...l, ...patch } : l))
  useApp.setState({ layers })
  if (record) recordLayers('Edit layer', before, layers, s.activeLayer, s.activeLayer)
}

/** Commit a change made live (e.g. while dragging) as a single undo step. */
export function commitLayers(label: string, before: LayerMeta[]): void {
  const s = useApp.getState()
  if (before !== s.layers) recordLayers(label, before, s.layers, s.activeLayer, s.activeLayer)
}

export function removeLayer(id: string): void {
  const s = useApp.getState()
  const before = s.layers
  const idx = before.findIndex((l) => l.id === id)
  if (idx < 0) return
  const rt = runtimes.get(id)
  // Live cameras can't come back on undo: freeze them into a still first.
  if (rt?.stream) {
    const still = makeCanvas(rt.width, rt.height)
    const ctx = still.getContext('2d')!
    if (rt.mirror) ctx.setTransform(-1, 0, 0, 1, still.width, 0)
    ctx.drawImage(rt.el, 0, 0, still.width, still.height)
    disposeRuntime(rt)
    runtimes.set(id, { el: still, width: rt.width, height: rt.height, mask: rt.mask, version: rt.version + 1 })
  } else if (rt?.video) {
    rt.video.pause()
  }
  const layers = before.filter((l) => l.id !== id)
  const next = layers[Math.min(idx, layers.length - 1)]?.id ?? null
  useApp.setState({ layers, activeLayer: next })
  recordLayers('Delete layer', before, layers, s.activeLayer, next)
}

export function moveLayer(id: string, dir: 1 | -1): void {
  const s = useApp.getState()
  const before = s.layers
  const i = before.findIndex((l) => l.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= before.length) return
  const layers = [...before]
  ;[layers[i], layers[j]] = [layers[j], layers[i]]
  useApp.setState({ layers })
  recordLayers(dir > 0 ? 'Bring forward' : 'Send backward', before, layers, s.activeLayer, s.activeLayer)
}

export function duplicateLayer(id: string): void {
  const s = useApp.getState()
  const src = s.layers.find((l) => l.id === id)
  const rt = runtimes.get(id)
  if (!src || !rt) return
  let copy: LayerRuntime
  if (rt.video || rt.stream || rt.gif) {
    copy = { ...rt, version: 0 }
  } else {
    const c = makeCanvas((rt.el as HTMLCanvasElement).width, (rt.el as HTMLCanvasElement).height)
    c.getContext('2d')!.drawImage(rt.el, 0, 0)
    copy = { ...rt, el: c, paint: rt.paint ? c : undefined, temp: undefined, version: 0 }
  }
  if (rt.mask) {
    const m = makeCanvas(rt.mask.width, rt.mask.height)
    m.getContext('2d')!.drawImage(rt.mask, 0, 0)
    copy.mask = m
  }
  const nid = newLayerId()
  runtimes.set(nid, copy)
  const before = s.layers
  const meta: LayerMeta = { ...src, id: nid, name: `${src.name} copy`, x: src.x + 24, y: src.y + 24 }
  const layers = [...before]
  layers.splice(before.indexOf(src) + 1, 0, meta)
  useApp.setState({ layers, activeLayer: nid })
  recordLayers('Duplicate layer', before, layers, s.activeLayer, nid)
}

export function selectLayer(id: string | null): void {
  useApp.setState({ activeLayer: id })
}

/** Fit / fill / center the active layer on the board. */
export function placeLayer(id: string, how: 'fit' | 'fill' | 'center'): void {
  const s = useApp.getState()
  const l = s.layers.find((x) => x.id === id)
  if (!l || !s.board) return
  const b = s.board
  const patch: Partial<LayerMeta> = { x: b.width / 2, y: b.height / 2, rotation: 0 }
  if (how === 'fit') patch.scale = fitScale(b, l.width, l.height)
  if (how === 'fill') patch.scale = Math.max(b.width / l.width, b.height / l.height)
  updateLayer(id, patch)
}

/** Change the board aspect ratio (layers keep their place relative to the center). */
export function setBoardAspect(ratio: number | 'auto'): void {
  const s = useApp.getState()
  const old = s.board
  if (!old) return
  let w: number
  let h: number
  if (ratio === 'auto') {
    const first = s.layers.find((l) => l.kind !== 'paint')
    const r = first ? first.width / first.height : 1
    w = r >= 1 ? BOARD_MAX : Math.round(BOARD_MAX * r)
    h = r >= 1 ? Math.round(BOARD_MAX / r) : BOARD_MAX
  } else {
    w = ratio >= 1 ? BOARD_MAX : Math.round(BOARD_MAX * ratio)
    h = ratio >= 1 ? Math.round(BOARD_MAX / ratio) : BOARD_MAX
  }
  const dx = (w - old.width) / 2
  const dy = (h - old.height) / 2
  const before = s.layers
  const layers = before.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy }))
  // Paint layers grow with the board so the brush can reach every corner.
  for (const l of layers) {
    const rt = runtimes.get(l.id)
    if (l.kind === 'paint' && rt?.paint && (rt.paint.width < w || rt.paint.height < h)) {
      const c = makeCanvas(Math.max(w, rt.paint.width), Math.max(h, rt.paint.height))
      c.getContext('2d')!.drawImage(rt.paint, (c.width - rt.paint.width) / 2, (c.height - rt.paint.height) / 2)
      rt.paint = c
      rt.el = c
      rt.width = c.width
      rt.height = c.height
      l.width = c.width
      l.height = c.height
      l.x = w / 2
      l.y = h / 2
      l.scale = 1
    }
  }
  const prevBoard = old
  const board = { width: w, height: h }
  useApp.setState({ board, layers })
  history.push({
    label: 'Board size',
    undo: () => useApp.setState({ board: prevBoard, layers: before }),
    redo: () => useApp.setState({ board, layers }),
  })
}

/** Start an empty board for drawing. */
export function newBlankBoard(ratio = 1): void {
  clearBoard()
  const w = ratio >= 1 ? BOARD_MAX : Math.round(BOARD_MAX * ratio)
  const h = ratio >= 1 ? Math.round(BOARD_MAX / ratio) : BOARD_MAX
  useApp.setState({ board: { width: w, height: h }, title: 'Untitled' })
  addPaintLayer('Paint')
  useApp.getState().setTool('brush')
}

export function addPaintLayer(name = 'Paint', tint: 'ink' | 'none' = 'ink', where: Placement = 'above'): string {
  const s = useApp.getState()
  const b = s.board ?? ensureBoard(BOARD_MAX, BOARD_MAX)
  const c = makeCanvas(b.width, b.height)
  return addLayer({ el: c, paint: c, width: c.width, height: c.height, version: 0 }, { kind: 'paint', name, extra: { tint, scale: 1 } }, where)
}

/** Remove everything (layers, glyphs, history). */
export function clearBoard(): void {
  for (const rt of runtimes.values()) disposeRuntime(rt)
  runtimes.clear()
  studio.edits.load([])
  studio.typeCursor = null
  history.clear()
  useApp.setState({ layers: [], activeLayer: null, board: null, glyphLayer: { visible: true, count: 0 } })
  studio.invalidate('composite')
}

/** Throw away a layer's eraser mask (bring back everything that was erased). */
export function clearMask(id: string): void {
  const rt = runtimes.get(id)
  if (!rt?.mask) return
  const mask = rt.mask
  rt.mask = undefined
  updateLayer(id, { hasMask: false }, false)
  history.push({
    label: 'Restore erased areas',
    undo: () => {
      rt.mask = mask
      updateLayer(id, { hasMask: true }, false)
    },
    redo: () => {
      rt.mask = undefined
      updateLayer(id, { hasMask: false }, false)
    },
  })
}

/** Wipe a paint layer (one undo step). */
export function clearPaint(id: string): void {
  const rt = runtimes.get(id)
  const c = rt?.paint
  if (!rt || !c) return
  const ctx = c.getContext('2d')!
  const before = ctx.getImageData(0, 0, c.width, c.height)
  const wipe = () => {
    ctx.clearRect(0, 0, c.width, c.height)
    rt.version++
    studio.invalidate('composite')
  }
  wipe()
  history.push({
    label: 'Clear paint',
    undo: () => {
      ctx.putImageData(before, 0, 0)
      rt.version++
      studio.invalidate('composite')
    },
    redo: wipe,
  })
}
