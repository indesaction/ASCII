import { useEffect, useRef, useState, type ReactNode } from 'react'
import { addCameraLayer, pickFiles } from '../../app/actions'
import {
  addPaintLayer,
  clearMask,
  clearPaint,
  duplicateLayer,
  moveLayer,
  newBlankBoard,
  placeLayer,
  removeLayer,
  selectLayer,
  setBoardAspect,
  updateLayer,
  type Placement,
} from '../../app/doc'
import { history } from '../../app/history'
import { runtimes } from '../../app/runtime'
import { SAMPLES, addText, flipCamera, freezeLayer, glyphRedo, glyphUndo, seekVideo, setPdfPage, setVideo, updateText } from '../../app/sources'
import { studio } from '../../app/studio'
import { GLYPH_LAYER } from '../../app/tools'
import { useApp, type BlendMode, type LayerMeta } from '../../state/store'
import { Hint, Section, Segmented, Select, Slider, Toggle } from '../controls'
import { Badge, Button, IconButton, Tile } from '../ds'
import { I } from '../icons'

const KIND_LABEL: Record<LayerMeta['kind'], string> = {
  image: 'Image',
  video: 'Video',
  camera: 'Camera',
  text: 'Text',
  paint: 'Paint',
  gif: 'GIF',
  pdf: 'PDF',
}

const BLENDS: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'difference', label: 'Difference' },
  { value: 'lighter', label: 'Add' },
]

function Thumb({ layer }: { layer: LayerMeta }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const draw = () => {
      const c = ref.current
      const rt = runtimes.get(layer.id)
      if (!c || !rt) return
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, c.width, c.height)
      const s = Math.min(c.width / rt.width, c.height / rt.height)
      const w = rt.width * s
      const h = rt.height * s
      ctx.save()
      if (rt.mirror) {
        ctx.translate(c.width, 0)
        ctx.scale(-1, 1)
      }
      if (layer.tint === 'ink' || (layer.kind === 'text' && layer.text?.fill === 'ink')) {
        ctx.drawImage(rt.el, (c.width - w) / 2, (c.height - h) / 2, w, h)
        ctx.globalCompositeOperation = 'source-in'
        ctx.fillStyle = getComputedStyle(c).color
        ctx.fillRect(0, 0, c.width, c.height)
      } else ctx.drawImage(rt.el, (c.width - w) / 2, (c.height - h) / 2, w, h)
      ctx.restore()
    }
    draw()
    const live = layer.kind === 'video' || layer.kind === 'camera' || layer.kind === 'gif' || layer.kind === 'paint'
    if (!live) return
    const t = setInterval(draw, 700)
    return () => clearInterval(t)
  }, [layer])
  return <canvas ref={ref} className="thumb" width={44} height={44} aria-hidden="true" />
}

function VideoControls({ layer }: { layer: LayerMeta }) {
  const [pos, setPos] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      const v = runtimes.get(layer.id)?.video
      if (v && isFinite(v.duration) && v.duration > 0) setPos(v.currentTime / v.duration)
    }, 200)
    return () => clearInterval(t)
  }, [layer.id])
  const playing = layer.playing !== false
  return (
    <>
      <div className="row">
        <Button size="sm" icon={playing ? <I.Pause size={14} /> : <I.Play size={14} />} onClick={() => setVideo(layer.id, { playing: !playing })}>
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button size="sm" icon={<I.Freeze size={14} />} onClick={() => freezeLayer(layer.id)}>
          Freeze frame
        </Button>
      </div>
      <Slider label="Position" value={pos} min={0} max={1} step={0.001} onChange={(v) => seekVideo(layer.id, v)} format={(v) => `${Math.round(v * 100)}%`} />
      <Segmented
        size="sm"
        label="Speed"
        value={layer.rate ?? 1}
        onChange={(rate) => setVideo(layer.id, { rate })}
        options={[0.25, 0.5, 1, 1.5, 2].map((v) => ({ value: v, label: `${v}×` }))}
      />
      <Toggle label="Loop" checked={layer.loop !== false} onChange={(loop) => setVideo(layer.id, { loop })} />
    </>
  )
}

function TextControls({ layer }: { layer: LayerMeta }) {
  const t = layer.text!
  const [draft, setDraft] = useState(t.text)
  useEffect(() => {
    if (draft === t.text) return
    const id = setTimeout(() => void updateText(layer.id, { text: draft }), 160)
    return () => clearTimeout(id)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <textarea className="textarea" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Text" />
      <Segmented
        size="sm"
        value={t.font}
        onChange={(font) => void updateText(layer.id, { font })}
        options={[
          { value: 'display', label: <span className="serif-i">Display</span> },
          { value: 'serif', label: 'Serif' },
          { value: 'sans', label: 'Sans' },
          { value: 'mono', label: 'Mono' },
        ]}
      />
      <div className="row split">
        <Segmented
          size="sm"
          value={t.weight}
          onChange={(weight) => void updateText(layer.id, { weight })}
          options={[
            { value: 400, label: 'Regular' },
            { value: 700, label: 'Bold' },
            { value: 900, label: 'Black' },
          ]}
        />
        <Segmented
          size="sm"
          value={t.italic ? 'i' : 'r'}
          onChange={(v) => void updateText(layer.id, { italic: v === 'i' })}
          options={[
            { value: 'r', label: 'Roman' },
            { value: 'i', label: <em>Italic</em> },
          ]}
        />
      </div>
      <div className="row">
        <Segmented
          size="sm"
          value={t.fill}
          onChange={(fill) => void updateText(layer.id, { fill })}
          options={[
            { value: 'ink', label: 'Ink' },
            { value: 'color', label: 'Color' },
          ]}
        />
        {t.fill === 'color' && (
          <label className="swatch-btn is-on" style={{ background: t.color }} title="Text color">
            <input type="color" value={t.color} onChange={(e) => void updateText(layer.id, { color: e.target.value })} aria-label="Text color" />
          </label>
        )}
      </div>
    </>
  )
}

function PlacementField({ id }: { id: string }) {
  return (
    <div className="field">
      <span className="field-label">Placement</span>
      <div className="segmented sm" role="group" aria-label="Placement">
        <button type="button" onClick={() => placeLayer(id, 'fit')}>
          Fit
        </button>
        <button type="button" onClick={() => placeLayer(id, 'fill')}>
          Fill
        </button>
        <button type="button" onClick={() => placeLayer(id, 'center')}>
          Center
        </button>
      </div>
    </div>
  )
}

function GlyphLayerSettings() {
  const glyphLayer = useApp((s) => s.glyphLayer)
  return (
    <Section title="Glyph layer">
      <Hint>Everything you stamp with Glyph or write with Type lives here, on top of the converted art. It survives every look and setting change.</Hint>
      <div className="row">
        <Button size="sm" icon={glyphLayer.visible ? <I.EyeOff size={14} /> : <I.Eye size={14} />} onClick={() => useApp.setState({ glyphLayer: { ...glyphLayer, visible: !glyphLayer.visible } })}>
          {glyphLayer.visible ? 'Hide' : 'Show'}
        </Button>
        <Button size="sm" icon={<I.Trash size={14} />} disabled={!glyphLayer.count} onClick={clearGlyphs}>
          Clear {glyphLayer.count ? `${glyphLayer.count} cells` : ''}
        </Button>
      </div>
    </Section>
  )
}

function clearGlyphs() {
  studio.edits.clear()
  history.push({ label: 'Clear glyphs', undo: glyphUndo, redo: glyphRedo })
  studio.applyEdits()
  studio.syncEdits()
}

/** Properties of the selected layer. */
export function LayerInspector() {
  const layers = useApp((s) => s.layers)
  const activeId = useApp((s) => s.activeLayer)
  const board = useApp((s) => s.board)
  const layer = layers.find((l) => l.id === activeId) ?? null
  if (activeId === GLYPH_LAYER) return <GlyphLayerSettings />
  if (!layer)
    return (
      <div className="empty-note">
        <span className="t-caption">No layer selected</span>
        <Hint>{board ? 'Pick a layer in the stack, or tap one on the board with Move.' : 'Add a file, the camera, text or paint to begin.'}</Hint>
      </div>
    )
  const rt = runtimes.get(layer.id)
  return (
    <>
      <Section title={`${KIND_LABEL[layer.kind]} layer`} aside={<Badge>{layer.width}×{layer.height}</Badge>}>
        <input className="input" value={layer.name} aria-label="Layer name" onChange={(e) => updateLayer(layer.id, { name: e.target.value }, false)} />
        {layer.kind === 'text' && layer.text && <TextControls key={layer.id} layer={layer} />}
        {layer.kind === 'video' && <VideoControls layer={layer} />}
        {layer.kind === 'camera' && (
          <div className="row">
            <Button size="sm" icon={<I.Flip size={14} />} onClick={() => void flipCamera(layer.id)}>
              Flip camera
            </Button>
            <Button size="sm" icon={<I.Freeze size={14} />} onClick={() => freezeLayer(layer.id)}>
              Freeze frame
            </Button>
          </div>
        )}
        {layer.kind === 'gif' && (
          <div className="row">
            <Button size="sm" icon={layer.playing === false ? <I.Play size={14} /> : <I.Pause size={14} />} onClick={() => updateLayer(layer.id, { playing: layer.playing === false }, false)}>
              {layer.playing === false ? 'Play' : 'Pause'}
            </Button>
            <Segmented size="sm" value={layer.rate ?? 1} onChange={(rate) => updateLayer(layer.id, { rate }, false)} options={[0.5, 1, 2].map((v) => ({ value: v, label: `${v}×` }))} />
          </div>
        )}
        {layer.kind === 'pdf' && (layer.pages ?? 1) > 1 && (
          <div className="pager">
            <IconButton size="sm" label="Previous page" disabled={(layer.page ?? 1) <= 1} icon={<I.Up size={16} style={{ transform: 'rotate(-90deg)' }} />} onClick={() => void setPdfPage(layer.id, (layer.page ?? 1) - 1)} />
            <span className="t-meta">
              Page {layer.page ?? 1} of {layer.pages}
            </span>
            <IconButton size="sm" label="Next page" disabled={(layer.page ?? 1) >= (layer.pages ?? 1)} icon={<I.Up size={16} style={{ transform: 'rotate(90deg)' }} />} onClick={() => void setPdfPage(layer.id, (layer.page ?? 1) + 1)} />
          </div>
        )}
      </Section>
      <Section title="Compositing">
        <Slider label="Opacity" value={layer.opacity} min={0} max={1} onChange={(opacity) => updateLayer(layer.id, { opacity }, false)} format={(v) => `${Math.round(v * 100)}%`} />
        <Select label="Blend" value={layer.blend} onChange={(blend) => updateLayer(layer.id, { blend })} options={BLENDS} />
        <PlacementField id={layer.id} />
        {((layer.kind === 'paint' && rt?.paint) || (layer.hasMask && rt?.mask)) && (
          <div className="row">
            {layer.kind === 'paint' && rt?.paint && (
              <Button size="sm" icon={<I.Trash size={14} />} onClick={() => clearPaint(layer.id)}>
                Clear paint
              </Button>
            )}
            {layer.hasMask && rt?.mask && (
              <Button size="sm" icon={<I.Undo size={14} />} onClick={() => clearMask(layer.id)}>
                Restore erased areas
              </Button>
            )}
          </div>
        )}
      </Section>
    </>
  )
}

const ADD: { id: string; name: string; icon: ReactNode }[] = [
  { id: 'files', name: 'Files', icon: <I.Upload /> },
  { id: 'camera', name: 'Camera', icon: <I.Camera /> },
  { id: 'text', name: 'Text', icon: <I.Text /> },
  { id: 'paint', name: 'Paint', icon: <I.Brush /> },
]

/** Add tiles, the layer stack and board format. `heading: false` when the host already titles it. */
export function LayerStack({ heading = true }: { heading?: boolean }) {
  const layers = useApp((s) => s.layers)
  const activeId = useApp((s) => s.activeLayer)
  const board = useApp((s) => s.board)
  const glyphLayer = useApp((s) => s.glyphLayer)
  const [where, setWhere] = useState<Placement>('above')
  const active = layers.find((l) => l.id === activeId) ?? null
  const ordered = [...layers].reverse()

  const add = (id: string) => {
    if (id === 'files') pickFiles(where)
    else if (id === 'camera') void addCameraLayer(where)
    else if (id === 'text') void addText(where)
    else if (!board) newBlankBoard(1)
    else {
      addPaintLayer(`Paint ${layers.filter((l) => l.kind === 'paint').length + 1}`, 'ink', where)
      useApp.getState().setTool('brush')
    }
  }

  return (
    <>
      <Section title="Add">
        <div className="tile-grid add-grid">
          {ADD.map((a) => (
            <Tile key={a.id} size="sm" emblem={a.icon} label={a.name} onClick={() => add(a.id)} />
          ))}
        </div>
        {layers.length > 0 && (
          <Segmented
            size="sm"
            value={where}
            onChange={setWhere}
            options={[
              { value: 'above', label: 'Above selected' },
              { value: 'below', label: 'Below selected' },
            ]}
          />
        )}
      </Section>

      {board && (
        <Section title={heading ? 'Layers' : 'Stack'} aside={<span className="t-meta">top → bottom</span>}>
          <ul className="layer-list" role="listbox" aria-label="Layers">
            <li role="option" aria-selected={activeId === GLYPH_LAYER} className={`layer-row glyphs ${activeId === GLYPH_LAYER ? 'is-on' : ''} ${glyphLayer.visible ? '' : 'hidden-layer'}`} onClick={() => selectLayer(GLYPH_LAYER)}>
              <span className="thumb glyph-thumb" aria-hidden="true">
                A✦
              </span>
              <span className="layer-name">
                Glyphs
                <small>{glyphLayer.count ? `${glyphLayer.count} cells` : 'Type & stamps'}</small>
              </span>
              <IconButton
                size="sm"
                label={glyphLayer.visible ? 'Hide glyphs' : 'Show glyphs'}
                icon={glyphLayer.visible ? <I.Eye size={16} /> : <I.EyeOff size={16} />}
                onClick={(e) => {
                  e.stopPropagation()
                  useApp.setState({ glyphLayer: { ...glyphLayer, visible: !glyphLayer.visible } })
                }}
              />
            </li>
            {ordered.map((l) => (
              <li key={l.id} role="option" aria-selected={l.id === activeId} className={`layer-row ${l.id === activeId ? 'is-on' : ''} ${l.visible ? '' : 'hidden-layer'}`} onClick={() => selectLayer(l.id)}>
                <Thumb layer={l} />
                <span className="layer-name">
                  {l.name}
                  <small>
                    {KIND_LABEL[l.kind]}
                    {l.opacity < 1 ? ` · ${Math.round(l.opacity * 100)}%` : ''}
                    {l.blend !== 'source-over' ? ` · ${BLENDS.find((b) => b.value === l.blend)?.label}` : ''}
                  </small>
                </span>
                <IconButton
                  size="sm"
                  label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}
                  icon={l.visible ? <I.Eye size={16} /> : <I.EyeOff size={16} />}
                  onClick={(e) => {
                    e.stopPropagation()
                    updateLayer(l.id, { visible: !l.visible })
                  }}
                />
              </li>
            ))}
          </ul>
          {active && (
            <div className="layer-actions">
              <IconButton size="sm" label="Bring forward" icon={<I.Up size={16} />} onClick={() => moveLayer(active.id, 1)} />
              <IconButton size="sm" label="Send backward" icon={<I.Down size={16} />} onClick={() => moveLayer(active.id, -1)} />
              <IconButton size="sm" label="Duplicate layer" icon={<I.Duplicate size={16} />} onClick={() => duplicateLayer(active.id)} />
              <IconButton size="sm" label="Delete layer" icon={<I.Trash size={16} />} onClick={() => removeLayer(active.id)} />
            </div>
          )}
        </Section>
      )}

      <Section title="Samples" collapsible defaultOpen={!board}>
        <div className="chips">
          {SAMPLES.map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => void s.load()} title={`${s.kind} sample`}>
              {s.name}
            </button>
          ))}
        </div>
        <Hint>Photos, video, GIF, PDF, Illustrator, EPS, SVG, TIFF, PSD and text art. Everything stays on your device.</Hint>
      </Section>

      {board && (
        <Section title="Board" collapsible defaultOpen={false} aside={<span className="t-meta">{board.width}×{board.height}</span>}>
          <Segmented
            size="sm"
            value=""
            onChange={(v: string) => setBoardAspect(v === 'auto' ? 'auto' : Number(v))}
            options={[
              { value: 'auto', label: 'Orig.' },
              { value: '1', label: '1:1' },
              { value: String(4 / 5), label: '4:5' },
              { value: String(16 / 9), label: '16:9' },
              { value: String(9 / 16), label: '9:16' },
            ]}
          />
        </Section>
      )}
    </>
  )
}

/** Medium and compact screens: stack and inspector share one tab. */
export function LayersPanel() {
  return (
    <>
      <LayerStack />
      <LayerInspector />
    </>
  )
}
