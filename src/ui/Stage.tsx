import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { editorDown, editorMove, editorUp, typeKey, typeText } from '../app/editor'
import { SAMPLES, openText } from '../app/sources'
import { studio, type ViewInfo } from '../app/studio'
import { getAnimation } from '../anim/animations'
import { useApp } from '../state/store'
import { pickFile, toggleCamera } from '../app/actions'
import { I } from './icons'

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6]

function CompareOverlay({ view }: { view: ViewInfo }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const x = useApp((s) => s.ui.compareX)
  const setUi = useApp((s) => s.setUi)
  const source = useApp((s) => s.source)
  const l = view.layout
  const left = l.pad * l.cellW * view.zoom
  const top = l.pad * l.cellH * view.zoom
  const w = l.cols * l.cellW * view.zoom
  const h = l.rows * l.cellH * view.zoom

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const c = ref.current
      const src = studio.source
      if (c && src) {
        const dpr = Math.min(2, devicePixelRatio || 1)
        const W = Math.max(1, Math.round(w * dpr))
        const H = Math.max(1, Math.round(h * dpr))
        if (c.width !== W) c.width = W
        if (c.height !== H) c.height = H
        const ctx = c.getContext('2d')!
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, W, H)
        if (src.mirror) ctx.setTransform(-1, 0, 0, 1, W, 0)
        ctx.drawImage(src.el, 0, 0, W, H)
      }
      if (source?.live) raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [w, h, source])

  const drag = (e: RPointerEvent) => {
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
    setUi({ compareX: Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) })
  }

  return (
    <div className="compare" style={{ left, top, width: w, height: h }}>
      <canvas ref={ref} style={{ clipPath: `inset(0 ${(1 - x) * 100}% 0 0)` }} />
      <div
        className="compare-handle"
        style={{ left: `${x * 100}%` }}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          drag(e)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e)
        }}
      >
        <span>
          <i>Source</i>
          <i>ASCII</i>
        </span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="empty">
      <p className="eyebrow">Image · Vector · Video · Camera · Type</p>
      <h1>
        Every image,
        <br />
        <em>
          set in type<span className="accent-dot">.</span>
        </em>
      </h1>
      <p className="lede">
        Convert anything into ASCII art, animate it, edit it glyph by glyph, and export print‑ready vector PDFs in CMYK.
      </p>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={pickFile}>
          <I.Upload /> Choose a file
        </button>
        <button type="button" className="btn" onClick={() => void toggleCamera()}>
          <I.Camera /> Camera
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await openText()
            useApp.getState().setTab('source')
          }}
        >
          <I.Text /> Write
        </button>
      </div>
      <div className="empty-samples">
        <span className="mono-dim">or try</span>
        {SAMPLES.map((s) => (
          <button key={s.id} type="button" className="link" onClick={() => void s.load().then(() => useApp.getState().setTab('style'))}>
            {s.name}
          </button>
        ))}
      </div>
      <pre className="ramp-deco" aria-hidden="true">
        {' .:-=+*#%@'.repeat(6)}
      </pre>
    </div>
  )
}

export function Stage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const typeRef = useRef<HTMLTextAreaElement>(null)
  const source = useApp((s) => s.source)
  const ui = useApp((s) => s.ui)
  const setUi = useApp((s) => s.setUi)
  const tab = useApp((s) => s.tab)
  const tool = useApp((s) => s.editor.tool)
  const motion = useApp((s) => s.motion)
  const setMotion = useApp((s) => s.setMotion)
  const stats = useApp((s) => s.stats)
  const title = useApp((s) => s.title)
  const [view, setView] = useState<ViewInfo | null>(null)

  useEffect(() => {
    const c = canvasRef.current!
    studio.attach(c)
    return () => studio.detach(c)
  }, [])

  useEffect(() => studio.onView(setView), [])

  useEffect(() => {
    const el = stageRef.current!
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      // Leave room for the stage padding, the caption and the floating zoom pill.
      const narrow = r.width < 600
      studio.setViewport(Math.max(50, r.width - (narrow ? 24 : 96)), Math.max(50, r.height - (narrow ? 118 : 166)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const editing = tab === 'edit' && tool !== 'pan'
  const interactive = editing || motion.magnet

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!source) return
    if (editorDown(e.clientX, e.clientY, e.altKey || e.button === 2)) {
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
      if (useApp.getState().editor.tool === 'type') typeRef.current?.focus({ preventScroll: true })
    }
    onMove(e)
  }
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (motion.magnet) {
      const c = studio.clientToCell(e.clientX, e.clientY)
      if (c) {
        studio.pointer = { x: c.x, y: c.y, active: true }
        studio.invalidate(false)
      }
    }
    editorMove(e.clientX, e.clientY)
  }
  const onUp = () => editorUp()
  const onLeave = () => {
    if (studio.pointer.active) {
      studio.pointer.active = false
      studio.invalidate(false)
    }
  }

  const zoomStep = (dir: 1 | -1) => {
    const cur = ui.zoom === 'fit' ? 1 : ui.zoom
    const next = dir > 0 ? ZOOMS.find((z) => z > cur + 1e-6) : [...ZOOMS].reverse().find((z) => z < cur - 1e-6)
    if (next) setUi({ zoom: next === 1 ? 'fit' : next })
  }

  const anim = getAnimation(motion.animation)
  const caption = source && view

  return (
    <div className={`stage ${source ? 'has-art' : ''} ${ui.zoom !== 'fit' && ui.zoom > 1 ? 'zoomed' : ''}`} ref={stageRef}>
      <div className="stage-scroll">
        <div className="stage-inner">
          <figure className="art" style={{ display: source ? undefined : 'none' }}>
            <div
              className={`art-frame ${editing ? `editing tool-${tool}` : ''}`}
              style={{ touchAction: interactive ? 'none' : 'auto' }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={onLeave}
              onContextMenu={(e) => editing && e.preventDefault()}
            >
              <canvas ref={canvasRef} className="art-canvas" />
              {ui.compare && view && source && <CompareOverlay view={view} />}
            </div>
            {caption && (
              <figcaption>
                <span className="mono-dim cap-no">N° {String((stats.cols * 7 + stats.rows) % 1000).padStart(3, '0')}</span>
                <span className="cap-title">{title}</span>
                <span className="mono-dim">
                  {stats.cols}×{stats.rows}
                  {motion.animation !== 'none' ? ` · ${anim.name}` : ''}
                </span>
              </figcaption>
            )}
          </figure>
          {!source && <EmptyState />}
        </div>
      </div>

      <textarea
        ref={typeRef}
        className="type-sink"
        aria-label="Type glyphs"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.metaKey || e.ctrlKey) return
          if (typeKey(e.key)) e.preventDefault()
        }}
        onInput={(e) => {
          const t = e.currentTarget
          if ((e.nativeEvent as InputEvent).isComposing) return
          if (t.value) typeText(t.value)
          t.value = ''
        }}
        onCompositionEnd={(e) => {
          const t = e.currentTarget
          if (t.value) typeText(t.value)
          t.value = ''
        }}
      />

      {source && (
        <div className="stage-tools">
          {motion.animation !== 'none' && (
            <button type="button" className="icon-btn" title={motion.playing ? 'Pause' : 'Play'} onClick={() => setMotion({ playing: !motion.playing })}>
              {motion.playing ? <I.Pause /> : <I.Play />}
            </button>
          )}
          <button
            type="button"
            className={`icon-btn ${ui.compare ? 'on' : ''}`}
            title="Compare with source"
            onClick={() => setUi({ compare: !ui.compare })}
          >
            <I.Compare />
          </button>
          <span className="sep" />
          <button type="button" className="icon-btn" title="Zoom out" onClick={() => zoomStep(-1)}>
            <I.Minus />
          </button>
          <button type="button" className="zoom-label" title="Fit to screen" onClick={() => setUi({ zoom: 'fit' })}>
            {ui.zoom === 'fit' ? 'Fit' : `${Math.round(ui.zoom * 100)}%`}
          </button>
          <button type="button" className="icon-btn" title="Zoom in" onClick={() => zoomStep(1)}>
            <I.Plus />
          </button>
        </div>
      )}
      {source && (
        <div className="stage-meta mono-dim">
          {stats.glyphs.toLocaleString()} glyphs · {stats.renderer === 'webgl2' ? 'WebGL' : 'Canvas'}
          {(motion.animation !== 'none' && motion.playing) || source.live ? ` · ${stats.fps} fps` : ''}
        </div>
      )}
    </div>
  )
}
