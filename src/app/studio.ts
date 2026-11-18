import { prepareFrame } from '../anim/animations'
import { blendFor, composeFrame, type ComposeParams, type Prepared } from '../anim/compose'
import { PointerTracker } from '../anim/interact'
import { hexToRgb, proofRgb } from '../engine/color'
import { cellMetrics, convert, lightOnDark } from '../engine/convert'
import { buildRamp, charsetString } from '../engine/ramp'
import type { AsciiFrame, RGB, SourceFrame } from '../engine/types'
import { createRenderer, fitPixelRatio, RenderList, type Layout, type RGBA, type Renderer } from '../render'
import { useApp, type LayerMeta } from '../state/store'
import { EditLayer } from './edits'
import { isLive, makeCanvas, runtimes, type LayerRuntime } from './runtime'

export interface ViewInfo {
  cssW: number
  cssH: number
  zoom: number
  layout: Layout
}

const EXTRA_POOL = '01#%&*+=<>/\\|{}[]?!$@'
/** Longest side of the composite the converter samples from. */
const COMPOSITE_MAX = 1400

/**
 * The studio owns everything that changes every frame — layer pixels, the
 * composite, the converted frame, glyph edits and the render loop — so React
 * only re-renders on UI changes.
 */
export class Studio {
  base: AsciiFrame | null = null
  frame: AsciiFrame | null = null
  prep: Prepared | null = null
  readonly edits = new EditLayer()
  canvas: HTMLCanvasElement | null = null
  renderer: Renderer | null = null
  /** Flattened layers at sampling resolution. */
  readonly composite = makeCanvas(4, 4)
  compositeScale = 1
  private list = new RenderList()
  animTime = 0
  private lastNow = 0
  private raf = 0
  private needComposite = true
  private needConvert = true
  private needRender = true
  private lastCompositeAt = 0
  private fpsFrames = 0
  private fpsAt = 0
  private statsAt = 0
  readonly pointer = new PointerTracker()
  typeCursor: { x: number; y: number } | null = null
  /** Extra per-frame hooks (recorder, overlays). */
  private frameHooks = new Set<() => void>()
  private viewport = { w: 800, h: 600 }
  view: ViewInfo | null = null
  private viewListeners = new Set<(v: ViewInfo) => void>()
  private renderers = new WeakMap<HTMLCanvasElement, Renderer>()

  constructor() {
    useApp.subscribe((s, prev) => {
      if (s.layers !== prev.layers || s.board !== prev.board || s.shape.alphaInk !== prev.shape.alphaInk) this.needComposite = true
      // Ink-tinted layers depend on the background polarity.
      if (s.style.background !== prev.style.background || s.style.ink !== prev.style.ink || s.style.colorMode !== prev.style.colorMode)
        this.needComposite = true
      if (s.shape !== prev.shape || s.style !== prev.style) this.needConvert = true
      if (s.glyphLayer.visible !== prev.glyphLayer.visible) this.applyEdits()
      if (
        s.motion !== prev.motion ||
        s.interaction !== prev.interaction ||
        s.ui.zoom !== prev.ui.zoom ||
        s.tool !== prev.tool ||
        s.layers !== prev.layers
      )
        this.needRender = true
      if (s.motion.animation !== prev.motion.animation) this.animTime = 0
      this.kick()
    })
  }

  // -------------------------------------------------------------------------
  // wiring
  // -------------------------------------------------------------------------

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

  onFrame(cb: () => void): () => void {
    this.frameHooks.add(cb)
    this.kick()
    return () => this.frameHooks.delete(cb)
  }

  invalidate(what: 'composite' | 'convert' | 'render' = 'convert'): void {
    if (what === 'composite') this.needComposite = true
    if (what === 'composite' || what === 'convert') this.needConvert = true
    this.needRender = true
    this.kick()
  }

  // -------------------------------------------------------------------------
  // compositing
  // -------------------------------------------------------------------------

  /** Color that converts to full ink density for the current background. */
  inkFill(): string {
    return lightOnDark(useApp.getState().style) ? '#ffffff' : '#000000'
  }

  hasLiveLayers(): boolean {
    for (const l of useApp.getState().layers) if (isLive(l, runtimes.get(l.id))) return true
    return false
  }

  /** Draw one layer into `ctx` (whose transform maps board px → canvas px). */
  drawLayer(ctx: CanvasRenderingContext2D, l: LayerMeta, rt: LayerRuntime, ink: string): void {
    const textInk = l.kind === 'text' && l.text?.fill === 'ink'
    const tinted = l.tint === 'ink' || textInk
    let src: CanvasImageSource = rt.el
    let mirror = !!rt.mirror
    if (rt.mask || tinted) {
      const s = Math.min(1, 2048 / Math.max(rt.width, rt.height))
      const w = Math.max(1, Math.round(rt.width * s))
      const h = Math.max(1, Math.round(rt.height * s))
      if (!rt.temp) rt.temp = makeCanvas(w, h)
      const t = rt.temp
      if (t.width !== w || t.height !== h) {
        t.width = w
        t.height = h
      }
      const tc = t.getContext('2d')!
      tc.setTransform(1, 0, 0, 1, 0, 0)
      tc.globalCompositeOperation = 'source-over'
      tc.clearRect(0, 0, w, h)
      if (mirror) tc.setTransform(-1, 0, 0, 1, w, 0)
      tc.drawImage(rt.el, 0, 0, w, h)
      tc.setTransform(1, 0, 0, 1, 0, 0)
      if (rt.mask) {
        tc.globalCompositeOperation = 'destination-in'
        tc.drawImage(rt.mask, 0, 0, w, h)
      }
      if (tinted) {
        tc.globalCompositeOperation = 'source-in'
        tc.fillStyle = ink
        tc.fillRect(0, 0, w, h)
      }
      tc.globalCompositeOperation = 'source-over'
      src = t
      mirror = false
    }
    ctx.save()
    ctx.globalAlpha = l.opacity
    ctx.globalCompositeOperation = l.blend
    ctx.translate(l.x, l.y)
    ctx.rotate(l.rotation)
    ctx.scale(l.scale * (mirror ? -1 : 1), l.scale)
    ctx.drawImage(src, -l.width / 2, -l.height / 2, l.width, l.height)
    ctx.restore()
  }

  private doComposite(now: number): void {
    this.needComposite = false
    this.lastCompositeAt = now
    const s = useApp.getState()
    const board = s.board
    if (!board) return
    // Live media composites smaller: the converter only samples a few hundred pixels.
    const max = this.hasLiveLayers() ? 900 : COMPOSITE_MAX
    const q = Math.min(1, max / Math.max(board.width, board.height))
    const W = Math.max(1, Math.round(board.width * q))
    const H = Math.max(1, Math.round(board.height * q))
    const c = this.composite
    if (c.width !== W || c.height !== H) {
      c.width = W
      c.height = H
    }
    this.compositeScale = q
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.imageSmoothingQuality = 'high'
    const ink = this.inkFill()
    for (const l of s.layers) {
      if (!l.visible || l.opacity <= 0) continue
      const rt = runtimes.get(l.id)
      if (!rt) continue
      ctx.setTransform(q, 0, 0, q, 0, 0)
      this.drawLayer(ctx, l, rt, ink)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.needConvert = true
  }

  private advanceGifs(now: number): void {
    for (const l of useApp.getState().layers) {
      const rt = runtimes.get(l.id)
      if (!rt?.gif || l.playing === false || !l.visible) continue
      const t = ((now * 1000 * (l.rate ?? 1)) % rt.gif.total + rt.gif.total) % rt.gif.total
      let i = 0
      while (i < rt.gif.ends.length - 1 && rt.gif.ends[i] <= t) i++
      if (rt.el !== rt.gif.frames[i]) {
        rt.el = rt.gif.frames[i]
        this.needComposite = true
      }
    }
  }

  // -------------------------------------------------------------------------
  // conversion
  // -------------------------------------------------------------------------

  private doConvert(): void {
    this.needConvert = false
    const s = useApp.getState()
    if (!s.board) {
      this.base = null
      this.frame = null
      this.prep = null
      return
    }
    const src: SourceFrame = {
      el: this.composite,
      width: this.composite.width,
      height: this.composite.height,
      mask: s.shape.alphaInk,
    }
    try {
      this.base = convert(src, s.shape, s.style)
    } catch (err) {
      console.error(err)
      return
    }
    this.applyEdits()
  }

  /** Re-apply the glyph layer to the generated frame. */
  applyEdits(): void {
    if (!this.base) return
    const s = useApp.getState()
    this.frame = s.glyphLayer.visible ? this.edits.apply(this.base) : this.base
    const ramp = buildRamp(charsetString(s.shape), s.style.weight, s.shape.keepOrder)
    const pool = Array.from(ramp.chars)
    if (pool.filter((c) => c !== 32).length < 6) for (const ch of EXTRA_POOL) pool.push(ch.codePointAt(0)!)
    this.prep = prepareFrame(this.frame, ramp.chars, pool)
    this.needRender = true
    this.kick()
  }

  syncEdits(): void {
    const g = useApp.getState().glyphLayer
    if (g.count !== this.edits.size) useApp.setState({ glyphLayer: { ...g, count: this.edits.size } })
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
    const now = performance.now() / 1000
    const interactive = preview && s.tool === 'interact' && s.interaction.mode !== 'off' && !!this.frame
    const typing = preview && s.tool === 'text' && this.typeCursor
    return {
      animation: s.motion.animation,
      intensity: s.motion.intensity,
      duration: s.motion.duration,
      highlight: hexToRgb(s.motion.highlight),
      background: hexToRgb(s.style.background),
      aspect: w / h,
      still: opts.still,
      interaction: interactive ? this.pointer.state(now, s.interaction, this.frame!.cols, this.frame!.rows) : null,
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
    const changed =
      !this.view ||
      this.view.cssW !== view.cssW ||
      this.view.cssH !== view.cssH ||
      this.view.layout.cols !== view.layout.cols ||
      this.view.layout.rows !== view.layout.rows ||
      this.view.layout.pad !== view.layout.pad
    this.view = view
    if (changed) for (const cb of this.viewListeners) cb(view)
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
    this.advanceGifs(now / 1000)
    const live = this.hasLiveLayers()
    if (live && now - this.lastCompositeAt > 30) this.needComposite = true
    if (this.needComposite) this.doComposite(now)
    if (this.needConvert) this.doConvert()
    const interactive = s.tool === 'interact' && s.interaction.mode !== 'off' && this.pointer.busy(now / 1000)
    const typing = s.tool === 'text' && !!this.typeCursor
    const hooks = this.frameHooks.size > 0
    if (this.needRender || interactive || typing || hooks) {
      this.render()
      this.fpsFrames++
    }
    for (const cb of this.frameHooks) cb()
    if (now - this.fpsAt > 1000) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsAt || 1))
      this.fpsFrames = 0
      this.fpsAt = now
      this.publishStats(fps)
    } else if (now - this.statsAt > 300 && this.frame) {
      this.publishStats(useApp.getState().stats.fps)
    }
    const gifs = s.layers.some((l) => runtimes.get(l.id)?.gif && l.playing !== false && l.visible)
    if (animating || live || interactive || typing || hooks || gifs) this.kick()
    else this.lastNow = 0
  }

  private publishStats(fps: number): void {
    this.statsAt = performance.now()
    const f = this.frame
    const prev = useApp.getState().stats
    let glyphCount = 0
    if (this.prep) for (let i = 0; i < this.prep.blank.length; i++) glyphCount += this.prep.blank[i] ? 0 : 1
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

  // -------------------------------------------------------------------------
  // coordinates
  // -------------------------------------------------------------------------

  /** Client point → board pixels (null before the first render). */
  clientToBoard(clientX: number, clientY: number): { x: number; y: number } | null {
    const c = this.canvas
    const v = this.view
    const board = useApp.getState().board
    if (!c || !v || !board) return null
    const r = c.getBoundingClientRect()
    const l = v.layout
    const tw = l.cols + 2 * l.pad
    const th = l.rows + 2 * l.pad
    const ax = r.left + (l.pad / tw) * r.width
    const ay = r.top + (l.pad / th) * r.height
    const aw = (l.cols / tw) * r.width
    const ah = (l.rows / th) * r.height
    return { x: ((clientX - ax) / aw) * board.width, y: ((clientY - ay) / ah) * board.height }
  }

  /** Client point → cell coordinates (fractional). */
  clientToCell(clientX: number, clientY: number): { x: number; y: number } | null {
    const b = this.clientToBoard(clientX, clientY)
    return b ? this.boardToCell(b.x, b.y) : null
  }

  boardToCell(x: number, y: number): { x: number; y: number } | null {
    const board = useApp.getState().board
    const f = this.frame
    if (!board || !f) return null
    return { x: (x / board.width) * f.cols, y: (y / board.height) * f.rows }
  }

  /** The art area (board) in client coordinates. */
  artRect(): DOMRect | null {
    const c = this.canvas
    const v = this.view
    if (!c || !v) return null
    const r = c.getBoundingClientRect()
    const l = v.layout
    const tw = l.cols + 2 * l.pad
    const th = l.rows + 2 * l.pad
    return new DOMRect(r.left + (l.pad / tw) * r.width, r.top + (l.pad / th) * r.height, (l.cols / tw) * r.width, (l.rows / th) * r.height)
  }
}

export const studio = new Studio()
