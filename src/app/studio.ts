import { prepareFrame } from '../anim/animations'
import { blendFor, composeFrame, type ComposeParams, type Prepared } from '../anim/compose'
import { hexToRgb, proofRgb } from '../engine/color'
import { cellMetrics, convert } from '../engine/convert'
import { buildRamp, charsetString } from '../engine/ramp'
import type { AsciiFrame, RGB, SourceFrame } from '../engine/types'
import { createRenderer, fitPixelRatio, RenderList, type Layout, type RGBA, type Renderer } from '../render'
import { useApp, type SourceMeta } from '../state/store'
import { EditLayer } from './edits'

export interface ViewInfo {
  cssW: number
  cssH: number
  zoom: number
  layout: Layout
}

const EXTRA_POOL = '01#%&*+=<>/\\|{}[]?!$@'

/**
 * The studio owns everything that changes every frame (source pixels, the
 * converted frame, edits, the render loop) so React only re-renders on UI changes.
 */
export class Studio {
  source: SourceFrame | null = null
  video: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  base: AsciiFrame | null = null
  frame: AsciiFrame | null = null
  prep: Prepared | null = null
  readonly edits = new EditLayer()
  canvas: HTMLCanvasElement | null = null
  renderer: Renderer | null = null
  private list = new RenderList()
  animTime = 0
  private lastNow = 0
  private raf = 0
  private needConvert = true
  private needRender = true
  private lastConvertAt = 0
  private lastVideoTime = -1
  private fpsFrames = 0
  private fpsAt = 0
  private statsAt = 0
  pointer = { x: 0, y: 0, active: false }
  typeCursor: { x: number; y: number } | null = null
  private viewport = { w: 800, h: 600 }
  view: ViewInfo | null = null
  private viewListeners = new Set<(v: ViewInfo) => void>()

  constructor() {
    useApp.subscribe((s, prev) => {
      if (s.shape !== prev.shape || s.style !== prev.style) this.needConvert = true
      if (s.motion !== prev.motion || s.ui.zoom !== prev.ui.zoom || s.tab !== prev.tab || s.editor !== prev.editor)
        this.needRender = true
      if (s.motion.animation !== prev.motion.animation) this.animTime = 0
      this.kick()
    })
  }

  // -------------------------------------------------------------------------
  // wiring
  // -------------------------------------------------------------------------

  private renderers = new WeakMap<HTMLCanvasElement, Renderer>()

  attach(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas) return
    this.canvas = canvas
    // A canvas keeps its context for life, so reuse the renderer (StrictMode re-mounts).
    let r = this.renderers.get(canvas)
    if (!r) {
      r = createRenderer(canvas, true, true)
      this.renderers.set(canvas, r)
    }
    this.renderer = r
    this.view = null
    this.needRender = true
    this.kick()
  }

  detach(canvas: HTMLCanvasElement): void {
    if (this.canvas !== canvas) return
    this.renderer = null
    this.canvas = null
  }

  setViewport(w: number, h: number): void {
    if (w === this.viewport.w && h === this.viewport.h) return
    this.viewport = { w, h }
    this.needRender = true
    this.kick()
  }

  onView(cb: (v: ViewInfo) => void): () => void {
    this.viewListeners.add(cb)
    if (this.view) cb(this.view)
    return () => this.viewListeners.delete(cb)
  }

  // -------------------------------------------------------------------------
  // sources
  // -------------------------------------------------------------------------

  setSource(src: SourceFrame, meta: SourceMeta, live?: { video: HTMLVideoElement; stream?: MediaStream }): void {
    this.stopLive()
    this.source = src
    this.video = live?.video ?? null
    this.stream = live?.stream ?? null
    this.lastVideoTime = -1
    this.edits.load([])
    this.typeCursor = null
    this.needConvert = true
    useApp.setState({ source: meta, ui: { ...useApp.getState().ui, sheetOpen: true } })
    this.syncEdits()
    this.kick()
  }

  /** Swap pixels without resetting edits (live text re-render, etc). */
  updateSource(src: SourceFrame, meta?: Partial<SourceMeta>): void {
    this.source = src
    this.needConvert = true
    const cur = useApp.getState().source
    if (cur && meta) useApp.setState({ source: { ...cur, ...meta } })
    this.kick()
  }

  stopLive(): void {
    if (this.stream) for (const t of this.stream.getTracks()) t.stop()
    if (this.video) {
      this.video.pause()
      if (this.video.src.startsWith('blob:')) URL.revokeObjectURL(this.video.src)
    }
    this.stream = null
    this.video = null
  }

  clearSource(): void {
    this.stopLive()
    this.source = null
    this.base = null
    this.frame = null
    this.prep = null
    this.edits.load([])
    useApp.setState({ source: null })
    this.syncEdits()
    this.needRender = true
    this.kick()
  }

  /** Freeze the current live frame into a still image. */
  snapshot(): HTMLCanvasElement | null {
    if (!this.source) return null
    const c = document.createElement('canvas')
    c.width = this.source.width
    c.height = this.source.height
    const ctx = c.getContext('2d')!
    if (this.source.mirror) ctx.setTransform(-1, 0, 0, 1, c.width, 0)
    ctx.drawImage(this.source.el, 0, 0, c.width, c.height)
    return c
  }

  // -------------------------------------------------------------------------
  // conversion
  // -------------------------------------------------------------------------

  invalidate(convert = true): void {
    if (convert) this.needConvert = true
    this.needRender = true
    this.kick()
  }

  private doConvert(): void {
    this.needConvert = false
    if (!this.source) {
      this.base = null
      this.frame = null
      this.prep = null
      return
    }
    const s = useApp.getState()
    try {
      this.base = convert(this.source, s.shape, s.style)
    } catch (err) {
      console.error(err)
      return
    }
    this.applyEdits()
  }

  /** Re-apply the edit overlay to the generated frame. */
  applyEdits(): void {
    if (!this.base) return
    const s = useApp.getState()
    this.frame = this.edits.apply(this.base)
    const ramp = buildRamp(charsetString(s.shape), s.style.weight, s.shape.keepOrder)
    const pool = Array.from(ramp.chars)
    if (pool.filter((c) => c !== 32).length < 6) for (const ch of EXTRA_POOL) pool.push(ch.codePointAt(0)!)
    this.prep = prepareFrame(this.frame, ramp.chars, pool)
    this.needRender = true
  }

  syncEdits(): void {
    useApp.setState({ edits: { count: this.edits.size, canUndo: this.edits.canUndo, canRedo: this.edits.canRedo } })
  }

  // -------------------------------------------------------------------------
  // layout + rendering
  // -------------------------------------------------------------------------

  layoutFor(frame: AsciiFrame, pixelRatio: number): Layout {
    const st = useApp.getState().style
    const { w, h } = cellMetrics(st)
    return {
      cols: frame.cols,
      rows: frame.rows,
      cellW: w,
      cellH: h,
      fontSize: st.fontSize,
      weight: st.weight,
      pad: st.padding,
      pixelRatio,
    }
  }

  private computeView(frame: AsciiFrame): ViewInfo {
    const ui = useApp.getState().ui
    const layout = this.layoutFor(frame, 1)
    const artW = (layout.cols + 2 * layout.pad) * layout.cellW
    const artH = (layout.rows + 2 * layout.pad) * layout.cellH
    const fit = Math.max(0.05, Math.min(this.viewport.w / artW, this.viewport.h / artH))
    const zoom = ui.zoom === 'fit' ? fit : ui.zoom * fit
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const maxDim = this.renderer?.kind === 'webgl2' ? 8192 : 6000
    layout.pixelRatio = fitPixelRatio(layout, zoom * dpr, maxDim, 24_000_000)
    return { cssW: artW * zoom, cssH: artH * zoom, zoom, layout }
  }

  /** Composition parameters derived from the current settings. */
  composeParams(opts: { still?: boolean; preview?: boolean } = {}): ComposeParams {
    const s = useApp.getState()
    const { w, h } = cellMetrics(s.style)
    const preview = !!opts.preview
    const typing = preview && s.tab === 'edit' && s.editor.tool === 'type' && this.typeCursor
    return {
      animation: s.motion.animation,
      intensity: s.motion.intensity,
      duration: s.motion.duration,
      highlight: hexToRgb(s.motion.highlight),
      background: hexToRgb(s.style.background),
      aspect: w / h,
      still: opts.still,
      magnet:
        preview && s.motion.magnet && this.pointer.active
          ? { x: this.pointer.x, y: this.pointer.y, strength: 0.4 + s.motion.intensity * 0.6 }
          : null,
      cursor:
        typing && (performance.now() / 530) % 2 < 1.2
          ? { x: this.typeCursor!.x, y: this.typeCursor!.y, color: hexToRgb(s.ui.accent) }
          : null,
      proof: preview && s.style.proof,
    }
  }

  backgroundRGBA(forExport = false, transparentOverride?: boolean): RGBA {
    const st = useApp.getState().style
    const transparent = transparentOverride ?? st.transparent
    if (transparent) return [0, 0, 0, 0]
    let bg: RGB = hexToRgb(st.background)
    if (st.proof && !forExport) bg = proofRgb(bg[0], bg[1], bg[2])
    return [bg[0], bg[1], bg[2], 255]
  }

  private render(): void {
    this.needRender = false
    const canvas = this.canvas
    const renderer = this.renderer
    if (!canvas || !renderer) return
    const frame = this.frame
    const prep = this.prep
    if (!frame || !prep) {
      canvas.style.width = '0px'
      canvas.style.height = '0px'
      return
    }
    const view = this.computeView(frame)
    renderer.setLayout(view.layout)
    const cw = `${view.cssW}px`
    const ch = `${view.cssH}px`
    if (canvas.style.width !== cw) canvas.style.width = cw
    if (canvas.style.height !== ch) canvas.style.height = ch
    if (
      !this.view ||
      this.view.cssW !== view.cssW ||
      this.view.cssH !== view.cssH ||
      this.view.layout.cols !== view.layout.cols ||
      this.view.layout.rows !== view.layout.rows ||
      this.view.layout.pad !== view.layout.pad
    ) {
      this.view = view
      for (const cb of this.viewListeners) cb(view)
    }
    this.view = view
    const params = this.composeParams({ preview: true })
    composeFrame(this.list, frame, prep, this.animTime, params)
    renderer.render(this.list, this.backgroundRGBA(), blendFor(params.animation))
  }

  private kick(): void {
    if (!this.raf && typeof requestAnimationFrame !== 'undefined') this.raf = requestAnimationFrame(this.tick)
  }

  private tick = (now: number): void => {
    this.raf = 0
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0
    this.lastNow = now
    const s = useApp.getState()
    const animating = s.motion.playing && s.motion.animation !== 'none'
    if (animating) {
      this.animTime += dt * s.motion.speed
      this.needRender = true
    }
    const v = this.video
    const live = !!v && !v.paused && v.readyState >= 2
    if (live && now - this.lastConvertAt > 30 && v!.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v!.currentTime
      this.lastConvertAt = now
      this.needConvert = true
    }
    if (this.needConvert) this.doConvert()
    const magnet = s.motion.magnet && this.pointer.active
    const typing = s.tab === 'edit' && s.editor.tool === 'type' && !!this.typeCursor
    if (this.needRender || magnet || typing) {
      this.render()
      this.fpsFrames++
    }
    if (now - this.fpsAt > 1000) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsAt || 1))
      this.fpsFrames = 0
      this.fpsAt = now
      this.publishStats(fps)
    } else if (now - this.statsAt > 300 && this.frame) {
      this.publishStats(useApp.getState().stats.fps)
    }
    if (animating || live || magnet || typing || !!v) this.kick()
    else this.lastNow = 0
  }

  private publishStats(fps: number): void {
    this.statsAt = performance.now()
    const f = this.frame
    const prev = useApp.getState().stats
    const glyphCount = this.prep ? this.prep.blank.length - countOnes(this.prep.blank) : 0
    const next = {
      cols: f?.cols ?? 0,
      rows: f?.rows ?? 0,
      glyphs: glyphCount,
      renderer: this.renderer?.kind ?? '',
      fps,
    }
    if (
      prev.cols !== next.cols ||
      prev.rows !== next.rows ||
      prev.glyphs !== next.glyphs ||
      prev.renderer !== next.renderer ||
      prev.fps !== next.fps
    )
      useApp.setState({ stats: next })
  }

  /** Map a client point to a cell coordinate (fractional). */
  clientToCell(clientX: number, clientY: number): { x: number; y: number } | null {
    const c = this.canvas
    const v = this.view
    if (!c || !v) return null
    const r = c.getBoundingClientRect()
    const l = v.layout
    const x = ((clientX - r.left) / r.width) * (l.cols + 2 * l.pad) - l.pad
    const y = ((clientY - r.top) / r.height) * (l.rows + 2 * l.pad) - l.pad
    return { x, y }
  }
}

function countOnes(a: Uint8Array): number {
  let n = 0
  for (let i = 0; i < a.length; i++) n += a[i]
  return n
}

export const studio = new Studio()
