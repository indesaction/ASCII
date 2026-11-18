import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { commitLayers, updateLayer } from '../app/doc'
import { drawLens } from '../app/recorder'
import { studio, type ViewInfo } from '../app/studio'
import { boardDown, boardLeave, boardMove, boardUp, typeKey, typeText } from '../app/tools'
import { useApp, type LayerMeta } from '../state/store'
import { Hero } from './Hero'

/** Art area (board) inside the art frame, in CSS px. */
function artBox(view: ViewInfo) {
  const l = view.layout
  return {
    left: l.pad * l.cellW * view.zoom,
    top: l.pad * l.cellH * view.zoom,
    width: l.cols * l.cellW * view.zoom,
    height: l.rows * l.cellH * view.zoom,
  }
}

// ---------------------------------------------------------------------------
// overlays
// ---------------------------------------------------------------------------

function CompareOverlay({ view }: { view: ViewInfo }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const x = useApp((s) => s.ui.compareX)
  const setUi = useApp((s) => s.setUi)
  const box = artBox(view)
  useEffect(() => {
    const draw = () => {
      const c = ref.current
      if (!c) return
      const dpr = Math.min(2, devicePixelRatio || 1)
      const W = Math.max(1, Math.round(box.width * dpr))
      const H = Math.max(1, Math.round(box.height * dpr))
      if (c.width !== W) c.width = W
      if (c.height !== H) c.height = H
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, W, H)
      const bg = studio.backgroundRGBA()
      ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},${bg[3] / 255})`
      ctx.fillRect(0, 0, W, H)
      ctx.drawImage(studio.composite, 0, 0, W, H)
    }
    draw()
    return studio.onFrame(draw)
  }, [box.width, box.height])
  const drag = (e: RPointerEvent) => {
    const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
    setUi({ compareX: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) })
  }
  return (
    <div className="compare" style={box}>
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

function LensOverlay({ view }: { view: ViewInfo }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const draw = () => {
      const c = ref.current
      if (!c) return
      const dpr = Math.min(2, devicePixelRatio || 1)
      const W = Math.max(1, Math.round(view.cssW * dpr))
      const H = Math.max(1, Math.round(view.cssH * dpr))
      if (c.width !== W) c.width = W
      if (c.height !== H) c.height = H
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, W, H)
      drawLens(ctx, W, H)
    }
    draw()
    return studio.onFrame(draw)
  }, [view.cssW, view.cssH])
  return <canvas ref={ref} className="lens-layer" />
}

/** Transform handles for the active layer (Move tool). */
function Selection({ view, layer }: { view: ViewInfo; layer: LayerMeta }) {
  const board = useApp((s) => s.board)!
  const box = artBox(view)
  const k = box.width / board.width
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const lx = (sx * layer.width * layer.scale) / 2
    const ly = (sy * layer.height * layer.scale) / 2
    const c = Math.cos(layer.rotation)
    const s = Math.sin(layer.rotation)
    return [(layer.x + lx * c - ly * s) * k, (layer.y + lx * s + ly * c) * k]
  })
  const topMid = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2]
  const nx = Math.sin(layer.rotation)
  const ny = -Math.cos(layer.rotation)
  const rot = [topMid[0] + nx * 28, topMid[1] + ny * 28]
  const center = [layer.x * k, layer.y * k]

  const startDrag = (e: RPointerEvent, mode: 'scale' | 'rotate') => {
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget as Element
    el.setPointerCapture(e.pointerId)
    const before = useApp.getState().layers
    const svg = (el.closest('svg') as SVGSVGElement).getBoundingClientRect()
    const cx = svg.left + center[0]
    const cy = svg.top + center[1]
    const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx)
    const s0 = layer.scale
    const r0 = layer.rotation
    const move = (ev: PointerEvent) => {
      if (mode === 'scale') {
        const d = Math.hypot(ev.clientX - cx, ev.clientY - cy)
        updateLayer(layer.id, { scale: Math.max(0.02, (s0 * d) / d0) }, false)
      } else {
        let r = r0 + Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0
        if (ev.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12)
        updateLayer(layer.id, { rotation: r }, false)
      }
    }
    const up = () => {
      el.removeEventListener('pointermove', move as EventListener)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      commitLayers(mode === 'scale' ? 'Scale layer' : 'Rotate layer', before)
    }
    el.addEventListener('pointermove', move as EventListener)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  return (
    <svg className="selection" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} aria-hidden="true">
      <polygon points={corners.map((p) => p.join(',')).join(' ')} />
      <line x1={topMid[0]} y1={topMid[1]} x2={rot[0]} y2={rot[1]} />
      {corners.map((p, i) => (
        <circle key={i} className="handle" cx={p[0]} cy={p[1]} r={7} onPointerDown={(e) => startDrag(e, 'scale')} />
      ))}
      <circle className="handle rotate" cx={rot[0]} cy={rot[1]} r={7} onPointerDown={(e) => startDrag(e, 'rotate')} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// board
// ---------------------------------------------------------------------------

export function Board() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const typeRef = useRef<HTMLTextAreaElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d0: number; a0: number; s0: number; r0: number; id: string; before: LayerMeta[] } | null>(null)
  const board = useApp((s) => s.board)
  const compare = useApp((s) => s.ui.compare)
  const tool = useApp((s) => s.tool)
  const interactionMode = useApp((s) => s.interaction.mode)
  const brushSize = useApp((s) => s.brush.size)
  const active = useApp((s) => s.layers.find((l) => l.id === s.activeLayer) ?? null)
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
      // Keep in step with .stage-inner padding (board.css): the plate sits inside it.
      const r = el.getBoundingClientRect()
      const compact = matchMedia('(max-width: 860px)').matches
      // Phones: options bar above, dock (+ view controls when the sheet is closed) below.
      const sheetClosed = !!el.closest('.sheet-0')
      studio.setViewport(Math.max(50, r.width - (compact ? 16 : 96)), Math.max(50, r.height - (compact ? (sheetClosed ? 176 : 136) : 80)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (tool === 'text') typeRef.current?.focus({ preventScroll: true })
    if (tool !== 'text') studio.typeCursor = null
  }, [tool])

  const showCursor = (e: { clientX: number; clientY: number }) => {
    const c = cursorRef.current
    const stage = stageRef.current
    const art = studio.artRect()
    if (!c || !stage || !art || !board) return
    if (tool !== 'brush' && tool !== 'eraser') {
      c.style.display = 'none'
      return
    }
    const r = stage.getBoundingClientRect()
    const d = (brushSize * art.width) / board.width
    c.style.display = 'block'
    c.style.width = c.style.height = `${d}px`
    c.style.transform = `translate(${e.clientX - r.left - d / 2}px, ${e.clientY - r.top - d / 2}px)`
  }

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && tool === 'move' && active) {
      boardUp(null)
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        d0: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        a0: Math.atan2(b.y - a.y, b.x - a.x),
        s0: active.scale,
        r0: active.rotation,
        id: active.id,
        before: useApp.getState().layers,
      }
      return
    }
    if (boardDown(e)) {
      // Keep focus (the type sink) and avoid text selection while drawing.
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      if (tool === 'text') typeRef.current?.focus({ preventScroll: true })
    }
  }
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    showCursor(e)
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const p = pinch.current
      updateLayer(
        p.id,
        {
          scale: Math.max(0.02, (p.s0 * Math.hypot(b.x - a.x, b.y - a.y)) / p.d0),
          rotation: p.r0 + Math.atan2(b.y - a.y, b.x - a.x) - p.a0,
        },
        false,
      )
      return
    }
    const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? []
    if ((tool === 'brush' || tool === 'eraser') && events.length > 1) for (const ev of events) boardMove(ev)
    else boardMove(e)
  }
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pinch.current) {
      if (pointers.current.size < 2) {
        commitLayers('Pinch layer', pinch.current.before)
        pinch.current = null
      }
      return
    }
    boardUp(e)
  }

  const hasArt = !!board
  return (
    <div className={`stage ${hasArt ? 'has-art' : ''} tool-${tool}`} ref={stageRef} onPointerLeave={() => cursorRef.current && (cursorRef.current.style.display = 'none')}>
      <div className="stage-scroll">
        <div className="stage-inner">
          <figure className="art" style={{ display: hasArt ? undefined : 'none' }}>
            <div
              className="art-frame"
              style={{ touchAction: tool === 'hand' ? 'auto' : 'none' }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => boardLeave()}
              onContextMenu={(e) => tool !== 'hand' && e.preventDefault()}
            >
              <canvas ref={canvasRef} className="art-canvas" />
              {view && tool === 'interact' && interactionMode === 'lens' && <LensOverlay view={view} />}
              {compare && view && hasArt && <CompareOverlay view={view} />}
              {view && tool === 'move' && active && active.visible && <Selection view={view} layer={active} />}
            </div>
          </figure>
          {!hasArt && <Hero />}
        </div>
      </div>
      <div ref={cursorRef} className="brush-cursor" aria-hidden="true" />

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

    </div>
  )
}
