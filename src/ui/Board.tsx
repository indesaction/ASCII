import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { addCameraLayer, pickFiles } from '../app/actions'
import { commitLayers, duplicateLayer, newBlankBoard, placeLayer, removeLayer, updateLayer } from '../app/doc'
import { discardTake, drawLens, startRecording, stopRecording } from '../app/recorder'
import { SAMPLES, addText } from '../app/sources'
import { studio, type ViewInfo } from '../app/studio'
import { GLYPH_LAYER, boardDown, boardLeave, boardMove, boardUp, redo, rememberToolForPick, typeKey, typeText, undo } from '../app/tools'
import { getAnimation } from '../anim/animations'
import { BRUSH_CHARS } from '../engine/presets'
import { downloadBlob, fileBase, shareBlob } from '../export/common'
import { useApp, type LayerMeta } from '../state/store'
import { TOOLS } from './catalog'
import { INTERACTIONS } from './interactions'
import { I } from './icons'

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6]


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
// tool rail + options
// ---------------------------------------------------------------------------

function ToolRail() {
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)
  const history = useApp((s) => s.history)
  return (
    <nav className="tool-rail" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`rail-btn ${tool === t.id ? 'on' : ''}`}
          title={`${t.name} (${t.key})`}
          aria-label={t.name}
          aria-pressed={tool === t.id}
          onClick={() => {
            rememberToolForPick(tool)
            setTool(t.id)
          }}
        >
          {t.icon}
          <span>{t.name}</span>
        </button>
      ))}
      <span className="rail-sep" />
      <button type="button" className="rail-btn" title="Undo (⌘Z)" aria-label="Undo" disabled={!history.canUndo} onClick={undo}>
        <I.Undo />
        <span>Undo</span>
      </button>
      <button type="button" className="rail-btn" title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!history.canRedo} onClick={redo}>
        <I.Redo />
        <span>Redo</span>
      </button>
    </nav>
  )
}

function Mini({ label, value, min, max, step = 1, onChange, fmt }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="mini">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{fmt ? fmt(value) : value}</output>
    </label>
  )
}

function OptionsBar() {
  const tool = useApp((s) => s.tool)
  const brush = useApp((s) => s.brush)
  const setBrush = useApp((s) => s.setBrush)
  const glyph = useApp((s) => s.glyph)
  const setGlyph = useApp((s) => s.setGlyph)
  const interaction = useApp((s) => s.interaction)
  const setInteraction = useApp((s) => s.setInteraction)
  const active = useApp((s) => s.layers.find((l) => l.id === s.activeLayer) ?? null)
  const activeId = useApp((s) => s.activeLayer)
  const [chars, setChars] = useState<DOMRect | null>(null)
  const pct = (v: number) => `${Math.round(v * 100)}%`

  let body: ReactNode = null
  if (tool === 'interact') {
    body = (
      <>
        <div className="chip-row">
          {INTERACTIONS.map((m) => (
            <button key={m.id} type="button" className={`chip ${interaction.mode === m.id ? 'on' : ''}`} title={m.hint} onClick={() => setInteraction({ mode: m.id })}>
              {m.name}
            </button>
          ))}
        </div>
        <Mini label="Power" value={interaction.strength} min={0.1} max={1} step={0.01} onChange={(strength) => setInteraction({ strength })} fmt={pct} />
        <Mini label="Reach" value={interaction.radius} min={3} max={40} onChange={(radius) => setInteraction({ radius })} />
      </>
    )
  } else if (tool === 'brush' || tool === 'eraser') {
    body = (
      <>
        <Mini label="Size" value={brush.size} min={2} max={400} onChange={(size) => setBrush({ size })} />
        <Mini label="Soft" value={1 - brush.hardness} min={0} max={1} step={0.01} onChange={(v) => setBrush({ hardness: 1 - v })} fmt={pct} />
        <Mini label="Flow" value={brush.flow} min={0.05} max={1} step={0.01} onChange={(flow) => setBrush({ flow })} fmt={pct} />
        <Mini label="Smooth" value={brush.smoothing} min={0} max={1} step={0.01} onChange={(smoothing) => setBrush({ smoothing })} fmt={pct} />
        {tool === 'brush' && (
          <div className="ink-pick">
            <button type="button" className={`chip ${brush.ink ? 'on' : ''}`} onClick={() => setBrush({ ink: true })} title="Paints in the ink color — always readable, follows the background">
              Ink
            </button>
            <label className={`swatch-btn ${brush.ink ? '' : 'on'}`} title="Paint color" style={{ background: brush.color }}>
              <input type="color" value={brush.color} onChange={(e) => setBrush({ color: e.target.value, ink: false })} aria-label="Paint color" />
            </label>
          </div>
        )}
        <button type="button" className={`chip ${brush.pressure ? 'on' : ''}`} onClick={() => setBrush({ pressure: !brush.pressure })} title="Pen pressure controls size and flow">
          Pressure
        </button>
        {tool === 'eraser' && activeId !== GLYPH_LAYER && active && active.kind !== 'paint' && <span className="opt-hint">Hold Alt to restore</span>}
      </>
    )
  } else if (tool === 'glyph') {
    body = (
      <>
        <div className="glyph-popover-wrap">
          <button
            type="button"
            className="glyph-current"
            onClick={(e) => setChars(chars ? null : e.currentTarget.getBoundingClientRect())}
            aria-expanded={!!chars}
            title="Choose a glyph"
          >
            {glyph.char}
          </button>
          {chars &&
            createPortal(
            <div className="glyph-popover" role="dialog" aria-label="Glyphs" style={{ top: chars.bottom, left: chars.left }}>
              <input
                className="input mono"
                placeholder="Type any character"
                maxLength={4}
                onChange={(e) => {
                  const ch = [...e.target.value].pop()
                  if (ch) setGlyph({ char: ch })
                }}
              />
              <div className="glyph-grid">
                {[...new Set([...('✦★✶✺❋♥♡◆◇●○■□▲△' + BRUSH_CHARS)])].map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    className={glyph.char === ch ? 'on' : ''}
                    onClick={() => {
                      setGlyph({ char: ch })
                      setChars(null)
                    }}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>,
              document.body,
            )}
        </div>
        <Mini label="Size" value={glyph.size} min={1} max={9} onChange={(size) => setGlyph({ size })} />
        <button type="button" className={`chip ${glyph.colorMode === 'keep' ? 'on' : ''}`} onClick={() => setGlyph({ colorMode: glyph.colorMode === 'keep' ? 'paint' : 'keep' })} title="Keep the colors underneath">
          Keep colors
        </button>
        {glyph.colorMode === 'paint' && (
          <label className="swatch-btn on" style={{ background: glyph.color }} title="Glyph color">
            <input type="color" value={glyph.color} onChange={(e) => setGlyph({ color: e.target.value })} aria-label="Glyph color" />
          </label>
        )}
        <span className="opt-hint">Alt-drag removes glyphs</span>
      </>
    )
  } else if (tool === 'text') {
    body = (
      <>
        <span className="opt-hint">Click a cell, then type. Enter starts a new line.</span>
        <label className="swatch-btn on" style={{ background: glyph.color }} title="Text color">
          <input type="color" value={glyph.color} onChange={(e) => setGlyph({ color: e.target.value, colorMode: 'paint' })} aria-label="Text color" />
        </label>
      </>
    )
  } else if (tool === 'move') {
    body =
      active && activeId !== GLYPH_LAYER ? (
        <>
          <button type="button" className="chip" onClick={() => placeLayer(active.id, 'fit')}>
            Fit
          </button>
          <button type="button" className="chip" onClick={() => placeLayer(active.id, 'fill')}>
            Fill
          </button>
          <button type="button" className="chip" onClick={() => placeLayer(active.id, 'center')}>
            Center
          </button>
          <button type="button" className="icon-btn sm" title="Duplicate" aria-label="Duplicate layer" onClick={() => duplicateLayer(active.id)}>
            <I.Duplicate size={16} />
          </button>
          <button type="button" className="icon-btn sm" title="Delete" aria-label="Delete layer" onClick={() => removeLayer(active.id)}>
            <I.Trash size={16} />
          </button>
          <span className="opt-hint">Drag to move · corners scale · top handle rotates</span>
        </>
      ) : (
        <span className="opt-hint">Tap a layer on the board to select it</span>
      )
  } else if (tool === 'pick') {
    body = <span className="opt-hint">Tap the board to pick a color and a glyph</span>
  } else {
    body = <span className="opt-hint">Drag to look around when zoomed in</span>
  }
  return <div className="options-bar">{body}</div>
}

// ---------------------------------------------------------------------------
// recording
// ---------------------------------------------------------------------------

function RecButton() {
  const recording = useApp((s) => s.recording)
  const recPointer = useApp((s) => s.ui.recPointer)
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setSecs(Math.floor((performance.now() - recording.startedAt) / 1000)), 250)
    return () => {
      clearInterval(t)
      setSecs(0)
    }
  }, [recording])
  return recording ? (
    <button type="button" className="rec-btn live" onClick={() => void stopRecording()} aria-label="Stop recording">
      <i className="rec-dot" />
      {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}
      <span>Stop</span>
    </button>
  ) : (
    <button type="button" className="rec-btn" onClick={() => startRecording(recPointer)} title="Record the board as you play with it">
      <i className="rec-dot" />
      Rec
    </button>
  )
}

function TakeDialog() {
  const take = useApp((s) => s.take)
  const title = useApp((s) => s.title)
  if (!take) return null
  const name = `${fileBase(title)}-take.${take.ext}`
  return (
    <div className="sheet-backdrop" onClick={discardTake}>
      <div className="take" role="dialog" aria-modal="true" aria-label="Your recording" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>
            Your <em>take</em>
          </h2>
          <span className="mono-dim">
            {take.seconds.toFixed(1)}s · {take.ext.toUpperCase()}
          </span>
        </header>
        <video src={take.url} controls autoPlay loop muted playsInline />
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={discardTake}>
            Discard
          </button>
          <button type="button" className="btn" onClick={async () => void ((await shareBlob(take.blob, name, title)) || (await downloadBlob(take.blob, name)))}>
            <I.Share /> Share
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              try {
                if (await downloadBlob(take.blob, name)) useApp.getState().toast(`Saved ${name}`, 'success')
              } catch (err) {
                useApp.getState().toast((err as Error).message, 'error')
              }
            }}
          >
            <I.Download /> Download
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// empty state
// ---------------------------------------------------------------------------

const HEADLINE = 'set in type'
const SCRAMBLE = '#%&*+=<>/\\|~^:'

function useDecoded(text: string): string {
  const [out, setOut] = useState(text)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const id = setInterval(() => {
      frame++
      setOut(
        [...text]
          .map((ch, i) => (ch === ' ' || frame > 8 + i * 2 ? ch : SCRAMBLE[(frame * 7 + i * 3) % SCRAMBLE.length]))
          .join(''),
      )
      if (frame > 10 + text.length * 2) clearInterval(id)
    }, 45)
    return () => clearInterval(id)
  }, [text])
  return out
}

function EmptyState() {
  const decoded = useDecoded(HEADLINE)
  return (
    <div className="empty">
      <p className="eyebrow">Photo · Video · PDF · Vector · Camera · Type</p>
      <h1>
        Every image,
        <br />
        <em>
          {decoded}
          <span className="accent-dot">.</span>
        </em>
      </h1>
      <p className="lede">Layer photos, video and drawings on one board. Every pixel turns into living type you can touch, animate and print.</p>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={() => pickFiles()}>
          <I.Upload /> Add files
        </button>
        <button type="button" className="btn" onClick={() => newBlankBoard(1)}>
          <I.Brush /> Start drawing
        </button>
        <button type="button" className="btn" onClick={() => void addCameraLayer()}>
          <I.Camera /> Camera
        </button>
        <button type="button" className="btn" onClick={() => void addText('top')}>
          <I.Text /> Write
        </button>
      </div>
      <div className="empty-samples">
        <span className="mono-dim">or try</span>
        {SAMPLES.map((s) => (
          <button key={s.id} type="button" className="link" onClick={() => void s.load()}>
            {s.name}
          </button>
        ))}
      </div>
      <p className="formats mono-dim">JPG PNG WEBP GIF · MP4 WEBM MOV · PDF AI EPS SVG · TIFF PSD · TXT ANSI</p>
    </div>
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
  const ui = useApp((s) => s.ui)
  const setUi = useApp((s) => s.setUi)
  const tool = useApp((s) => s.tool)
  const motion = useApp((s) => s.motion)
  const setMotion = useApp((s) => s.setMotion)
  const interactionMode = useApp((s) => s.interaction.mode)
  const stats = useApp((s) => s.stats)
  const title = useApp((s) => s.title)
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
      const r = el.getBoundingClientRect()
      const narrow = r.width < 700
      studio.setViewport(Math.max(50, r.width - (narrow ? 20 : 190)), Math.max(50, r.height - (narrow ? 132 : 170)))
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

  const zoomStep = (dir: 1 | -1) => {
    const cur = ui.zoom === 'fit' ? 1 : ui.zoom
    const next = dir > 0 ? ZOOMS.find((z) => z > cur + 1e-6) : [...ZOOMS].reverse().find((z) => z < cur - 1e-6)
    if (next) setUi({ zoom: next === 1 ? 'fit' : next })
  }

  const anim = getAnimation(motion.animation)
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
              {ui.compare && view && hasArt && <CompareOverlay view={view} />}
              {view && tool === 'move' && active && active.visible && <Selection view={view} layer={active} />}
            </div>
            {hasArt && view && (
              <figcaption>
                <span className="cap-title">{title}</span>
                <span className="mono-dim">
                  {stats.cols}×{stats.rows}
                  {motion.animation !== 'none' ? ` · ${anim.name}` : ''}
                </span>
              </figcaption>
            )}
          </figure>
          {!hasArt && <EmptyState />}
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

      {hasArt && (
        <>
          <ToolRail />
          <OptionsBar />
          <div className="stage-top-right">
            <RecButton />
          </div>
          <div className="stage-tools">
            {motion.animation !== 'none' && (
              <button type="button" className="icon-btn" title={motion.playing ? 'Pause' : 'Play'} aria-label={motion.playing ? 'Pause' : 'Play'} onClick={() => setMotion({ playing: !motion.playing })}>
                {motion.playing ? <I.Pause /> : <I.Play />}
              </button>
            )}
            <button type="button" className={`icon-btn ${ui.compare ? 'on' : ''}`} title="Compare with the original" aria-label="Compare with the original" aria-pressed={ui.compare} onClick={() => setUi({ compare: !ui.compare })}>
              <I.Compare />
            </button>
            <span className="sep" />
            <button type="button" className="icon-btn" title="Zoom out" aria-label="Zoom out" onClick={() => zoomStep(-1)}>
              <I.Minus />
            </button>
            <button type="button" className="zoom-label" title="Fit to screen" onClick={() => setUi({ zoom: 'fit' })}>
              {ui.zoom === 'fit' ? 'Fit' : `${Math.round(ui.zoom * 100)}%`}
            </button>
            <button type="button" className="icon-btn" title="Zoom in" aria-label="Zoom in" onClick={() => zoomStep(1)}>
              <I.Plus />
            </button>
          </div>
          <div className="stage-meta mono-dim">
            {stats.glyphs.toLocaleString()} glyphs
            {(motion.animation !== 'none' && motion.playing) || studio.hasLiveLayers() ? ` · ${stats.fps} fps` : ''}
          </div>
        </>
      )}
      <TakeDialog />
    </div>
  )
}
