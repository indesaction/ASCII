/**
 * Canvas chrome around the board: the tool rail, the contextual options bar,
 * the status bar (meta + view controls) and the record button.
 */
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { duplicateLayer, placeLayer, removeLayer } from '../app/doc'
import { discardTake, startRecording, stopRecording } from '../app/recorder'
import { studio } from '../app/studio'
import { GLYPH_LAYER, redo, rememberToolForPick, undo } from '../app/tools'
import { getAnimation } from '../anim/animations'
import { BRUSH_CHARS } from '../engine/presets'
import { downloadBlob, fileBase, shareBlob } from '../export/common'
import { useApp } from '../state/store'
import { TOOLS } from './catalog'
import { Button, IconButton, Kbd, Popover } from './ds'
import { I } from './icons'
import { INTERACTIONS } from './interactions'

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6]

// ---------------------------------------------------------------------------
// tool rail
// ---------------------------------------------------------------------------

export function ToolRail() {
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)
  const history = useApp((s) => s.history)
  const groups = [...new Set(TOOLS.map((t) => t.group))]
  return (
    <nav className="tool-rail" aria-label="Tools">
      {groups.map((g, gi) => (
        <Fragment key={g}>
          {gi > 0 && <span className="rail-sep" aria-hidden="true" />}
          <div className="rail-group" data-group={g}>
            {TOOLS.filter((t) => t.group === g).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`rail-btn ${tool === t.id ? 'is-on' : ''}`}
                aria-label={`${t.name} (${t.key})`}
                aria-pressed={tool === t.id}
                onClick={() => {
                  rememberToolForPick(tool)
                  setTool(t.id)
                }}
              >
                {t.icon}
                <span className="rail-tip" aria-hidden="true">
                  {t.name} <Kbd>{t.key}</Kbd>
                </span>
              </button>
            ))}
          </div>
        </Fragment>
      ))}
      <span className="rail-sep rail-end" aria-hidden="true" />
      <div className="rail-group">
        <button type="button" className="rail-btn" aria-label="Undo" disabled={!history.canUndo} onClick={undo}>
          <I.Undo />
          <span className="rail-tip" aria-hidden="true">
            Undo <Kbd>⌘Z</Kbd>
          </span>
        </button>
        <button type="button" className="rail-btn" aria-label="Redo" disabled={!history.canRedo} onClick={redo}>
          <I.Redo />
          <span className="rail-tip" aria-hidden="true">
            Redo <Kbd>⇧⌘Z</Kbd>
          </span>
        </button>
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// options bar
// ---------------------------------------------------------------------------

/**
 * Compact fill slider for the options bar: the label and value sit inside the
 * track, so four of them fit where one full slider would.
 */
function Fill({ label, value, min, max, step = 1, onChange, fmt }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Math.round(v / step) * step)))
  const fromX = (el: HTMLElement, x: number) => {
    const r = el.getBoundingClientRect()
    set(min + ((x - r.left) / r.width) * (max - min))
  }
  return (
    <div
      className="fill"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={fmt ? fmt(value) : String(value)}
      style={{ '--p': `${pct}%` } as CSSProperties}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        fromX(e.currentTarget, e.clientX)
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromX(e.currentTarget, e.clientX)}
      onKeyDown={(e) => {
        const big = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') set(value + step * big)
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') set(value - step * big)
        else return
        e.preventDefault()
      }}
    >
      <span>{label}</span>
      <output>{fmt ? fmt(value) : value}</output>
    </div>
  )
}

function Chip({ on, children, ...rest }: { on?: boolean; children: ReactNode; onClick: () => void; title?: string }) {
  return (
    <button type="button" className={`chip ${on ? 'is-on' : ''}`} aria-pressed={on} {...rest}>
      {children}
    </button>
  )
}

function Swatch({ color, on, label, onChange }: { color: string; on?: boolean; label: string; onChange: (v: string) => void }) {
  return (
    <label className={`swatch-btn ${on ? 'is-on' : ''}`} title={label} style={{ background: color }}>
      <input type="color" value={color} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </label>
  )
}

function GlyphPicker() {
  const glyph = useApp((s) => s.glyph)
  const setGlyph = useApp((s) => s.setGlyph)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  return (
    <>
      <button type="button" className="glyph-current" onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())} aria-expanded={!!anchor} aria-label={`Glyph ${glyph.char}, choose another`}>
        {glyph.char}
      </button>
      {anchor && (
        <Popover anchor={anchor} align="start" label="Glyphs" onClose={() => setAnchor(null)} className="glyph-popover">
          <input
            className="input mono"
            placeholder="Type any character"
            maxLength={4}
            autoFocus
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
                className={glyph.char === ch ? 'is-on' : ''}
                onClick={() => {
                  setGlyph({ char: ch })
                  setAnchor(null)
                }}
              >
                {ch}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  )
}

export function OptionsBar() {
  const tool = useApp((s) => s.tool)
  const brush = useApp((s) => s.brush)
  const setBrush = useApp((s) => s.setBrush)
  const glyph = useApp((s) => s.glyph)
  const setGlyph = useApp((s) => s.setGlyph)
  const interaction = useApp((s) => s.interaction)
  const setInteraction = useApp((s) => s.setInteraction)
  const active = useApp((s) => s.layers.find((l) => l.id === s.activeLayer) ?? null)
  const activeId = useApp((s) => s.activeLayer)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const def = TOOLS.find((t) => t.id === tool)!
  let hint = def.hint

  let body: ReactNode = null
  if (tool === 'interact') {
    hint = INTERACTIONS.find((m) => m.id === interaction.mode)?.hint ?? hint
    body = (
      <>
        <div className="select sm">
          <select aria-label="Interaction" value={interaction.mode} onChange={(e) => setInteraction({ mode: e.target.value as typeof interaction.mode })}>
            {INTERACTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <Fill label="Power" value={interaction.strength} min={0.1} max={1} step={0.01} onChange={(strength) => setInteraction({ strength })} fmt={pct} />
        <Fill label="Reach" value={interaction.radius} min={3} max={40} onChange={(radius) => setInteraction({ radius })} />
      </>
    )
  } else if (tool === 'brush' || tool === 'eraser') {
    if (tool === 'eraser' && (activeId === GLYPH_LAYER || !active || active.kind === 'paint')) hint = 'Erases paint'
    body = (
      <>
        <Fill label="Size" value={brush.size} min={2} max={400} onChange={(size) => setBrush({ size })} />
        <Fill label="Soft" value={1 - brush.hardness} min={0} max={1} step={0.01} onChange={(v) => setBrush({ hardness: 1 - v })} fmt={pct} />
        <Fill label="Flow" value={brush.flow} min={0.05} max={1} step={0.01} onChange={(flow) => setBrush({ flow })} fmt={pct} />
        <Fill label="Smooth" value={brush.smoothing} min={0} max={1} step={0.01} onChange={(smoothing) => setBrush({ smoothing })} fmt={pct} />
        {tool === 'brush' && (
          <div className="ink-pick">
            <Chip on={brush.ink} onClick={() => setBrush({ ink: true })} title="Paints in the ink color — always readable, follows the background">
              Ink
            </Chip>
            <Swatch color={brush.color} on={!brush.ink} label="Paint color" onChange={(color) => setBrush({ color, ink: false })} />
          </div>
        )}
        <Chip on={brush.pressure} onClick={() => setBrush({ pressure: !brush.pressure })} title="Pen pressure controls size and flow">
          Pressure
        </Chip>
      </>
    )
  } else if (tool === 'glyph') {
    body = (
      <>
        <GlyphPicker />
        <Fill label="Size" value={glyph.size} min={1} max={9} onChange={(size) => setGlyph({ size })} />
        <Chip on={glyph.colorMode === 'keep'} onClick={() => setGlyph({ colorMode: glyph.colorMode === 'keep' ? 'paint' : 'keep' })} title="Keep the colors underneath">
          Keep colors
        </Chip>
        {glyph.colorMode === 'paint' && <Swatch color={glyph.color} on label="Glyph color" onChange={(color) => setGlyph({ color })} />}
      </>
    )
  } else if (tool === 'text') {
    body = <Swatch color={glyph.color} on label="Text color" onChange={(color) => setGlyph({ color, colorMode: 'paint' })} />
  } else if (tool === 'move') {
    if (active && activeId !== GLYPH_LAYER) {
      body = (
        <>
          <Chip onClick={() => placeLayer(active.id, 'fit')}>Fit</Chip>
          <Chip onClick={() => placeLayer(active.id, 'fill')}>Fill</Chip>
          <Chip onClick={() => placeLayer(active.id, 'center')}>Center</Chip>
          <IconButton size="sm" label="Duplicate layer" icon={<I.Duplicate size={16} />} onClick={() => duplicateLayer(active.id)} />
          <IconButton size="sm" label="Delete layer" icon={<I.Trash size={16} />} onClick={() => removeLayer(active.id)} />
        </>
      )
    } else hint = 'Tap a layer on the board to select it'
  }

  return (
    <div className="options-bar" role="toolbar" aria-label={`${def.name} options`}>
      <span className="opt-tool">
        {def.icon}
        <span className="t-label">{def.name}</span>
      </span>
      {body}
      <span className="opt-hint">{hint}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// status bar
// ---------------------------------------------------------------------------

export function StatusBar() {
  const ui = useApp((s) => s.ui)
  const setUi = useApp((s) => s.setUi)
  const motion = useApp((s) => s.motion)
  const setMotion = useApp((s) => s.setMotion)
  const stats = useApp((s) => s.stats)
  const animated = motion.animation !== 'none'
  const zoomStep = (dir: 1 | -1) => {
    const cur = ui.zoom === 'fit' ? 1 : ui.zoom
    const next = dir > 0 ? ZOOMS.find((z) => z > cur + 1e-6) : [...ZOOMS].reverse().find((z) => z < cur - 1e-6)
    if (next) setUi({ zoom: next === 1 ? 'fit' : next })
  }
  const live = (animated && motion.playing) || studio.hasLiveLayers()
  return (
    <footer className="statusbar">
      <div className="status-meta t-meta">
        <span>
          <b>
            {stats.cols} × {stats.rows}
          </b>{' '}
          cells
        </span>
        <span>{stats.glyphs.toLocaleString()} glyphs</span>
        {animated && <span>{getAnimation(motion.animation).name}</span>}
        {live && <span>{stats.fps} fps</span>}
      </div>
      <div className="view-tools">
        {animated && (
          <IconButton size="sm" label={motion.playing ? 'Pause (Space)' : 'Play (Space)'} icon={motion.playing ? <I.Pause size={16} /> : <I.Play size={16} />} onClick={() => setMotion({ playing: !motion.playing })} />
        )}
        <IconButton size="sm" label="Compare with the original" pressed={ui.compare} icon={<I.Compare size={16} />} onClick={() => setUi({ compare: !ui.compare })} />
        <span className="sep" />
        <IconButton size="sm" className="zoom-step" label="Zoom out" icon={<I.Minus size={16} />} onClick={() => zoomStep(-1)} />
        <button type="button" className="zoom-label" title="Fit to screen" onClick={() => setUi({ zoom: 'fit' })}>
          {ui.zoom === 'fit' ? 'Fit' : `${Math.round(ui.zoom * 100)}%`}
        </button>
        <IconButton size="sm" className="zoom-step" label="Zoom in" icon={<I.Plus size={16} />} onClick={() => zoomStep(1)} />
      </div>
    </footer>
  )
}

// ---------------------------------------------------------------------------
// recording
// ---------------------------------------------------------------------------

export function RecButton({ compact }: { compact?: boolean }) {
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
  if (recording)
    return (
      <Button variant="danger" className="is-live" onClick={() => void stopRecording()} aria-label="Stop recording" icon={<i className="rec-dot" />}>
        <span className="t-meta" style={{ color: 'inherit' }}>
          {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}
        </span>
      </Button>
    )
  return compact ? (
    <IconButton label="Record the board" icon={<i className="rec-dot" />} onClick={() => startRecording(recPointer)} />
  ) : (
    <Button variant="secondary" onClick={() => startRecording(recPointer)} title="Record the board as you play with it" icon={<i className="rec-dot" />}>
      Rec
    </Button>
  )
}

export function TakeDialog() {
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
          <span className="t-meta">
            {take.seconds.toFixed(1)}s · {take.ext.toUpperCase()}
          </span>
        </header>
        <video src={take.url} controls autoPlay loop muted playsInline />
        <div className="sheet-actions">
          <Button variant="ghost" onClick={discardTake}>
            Discard
          </Button>
          <Button variant="secondary" icon={<I.Share />} onClick={async () => void ((await shareBlob(take.blob, name, title)) || (await downloadBlob(take.blob, name)))}>
            Share
          </Button>
          <Button
            variant="primary"
            icon={<I.Download />}
            onClick={async () => {
              try {
                if (await downloadBlob(take.blob, name)) useApp.getState().toast(`Saved ${name}`, 'success')
              } catch (err) {
                useApp.getState().toast((err as Error).message, 'error')
              }
            }}
          >
            Download
          </Button>
        </div>
      </div>
    </div>
  )
}
