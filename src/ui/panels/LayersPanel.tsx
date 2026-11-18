import { useEffect, useRef, useState } from 'react'
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
        <button type="button" className="btn sm" onClick={() => setVideo(layer.id, { playing: !playing })}>
          {playing ? <I.Pause size={14} /> : <I.Play size={14} />} {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn sm" onClick={() => freezeLayer(layer.id)}>
          <I.Freeze size={14} /> Freeze frame
        </button>
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
          <label className="swatch-btn on" style={{ background: t.color }} title="Text color">
            <input type="color" value={t.color} onChange={(e) => void updateText(layer.id, { color: e.target.value })} aria-label="Text color" />
          </label>
        )}
      </div>
    </>
  )
}

function LayerSettings({ layer }: { layer: LayerMeta }) {
  const rt = runtimes.get(layer.id)
  return (
    <Section title={`${KIND_LABEL[layer.kind]} layer`}>
      <input
        className="input"
        value={layer.name}
        aria-label="Layer name"
        onChange={(e) => updateLayer(layer.id, { name: e.target.value }, false)}
      />
      {layer.kind === 'text' && layer.text && <TextControls key={layer.id} layer={layer} />}
      {layer.kind === 'video' && <VideoControls layer={layer} />}
      {layer.kind === 'camera' && (
        <div className="row">
          <button type="button" className="btn sm" onClick={() => void flipCamera(layer.id)}>
            <I.Flip size={14} /> Flip camera
          </button>
          <button type="button" className="btn sm" onClick={() => freezeLayer(layer.id)}>
            <I.Freeze size={14} /> Freeze frame
          </button>
        </div>
      )}
      {layer.kind === 'gif' && (
        <div className="row">
          <button type="button" className="btn sm" onClick={() => updateLayer(layer.id, { playing: layer.playing === false }, false)}>
            {layer.playing === false ? <I.Play size={14} /> : <I.Pause size={14} />} {layer.playing === false ? 'Play' : 'Pause'}
          </button>
          <Segmented size="sm" value={layer.rate ?? 1} onChange={(rate) => updateLayer(layer.id, { rate }, false)} options={[0.5, 1, 2].map((v) => ({ value: v, label: `${v}×` }))} />
        </div>
      )}
      {layer.kind === 'pdf' && (layer.pages ?? 1) > 1 && (
        <div className="pager">
          <button type="button" className="icon-btn sm" aria-label="Previous page" disabled={(layer.page ?? 1) <= 1} onClick={() => void setPdfPage(layer.id, (layer.page ?? 1) - 1)}>
            <I.Up size={16} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <span className="mono-dim">
            Page {layer.page ?? 1} of {layer.pages}
          </span>
          <button type="button" className="icon-btn sm" aria-label="Next page" disabled={(layer.page ?? 1) >= (layer.pages ?? 1)} onClick={() => void setPdfPage(layer.id, (layer.page ?? 1) + 1)}>
            <I.Up size={16} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </div>
      )}
      <Slider label="Opacity" value={layer.opacity} min={0} max={1} onChange={(opacity) => updateLayer(layer.id, { opacity }, false)} format={(v) => `${Math.round(v * 100)}%`} />
      <Select label="Blend" value={layer.blend} onChange={(blend) => updateLayer(layer.id, { blend })} options={BLENDS} />
      <div className="row">
        <button type="button" className="chip" onClick={() => placeLayer(layer.id, 'fit')}>
          Fit
        </button>
        <button type="button" className="chip" onClick={() => placeLayer(layer.id, 'fill')}>
          Fill
        </button>
        <button type="button" className="chip" onClick={() => placeLayer(layer.id, 'center')}>
          Center
        </button>
      </div>
      {layer.kind === 'paint' && rt?.paint && (
        <button
          type="button"
          className="btn sm"
          onClick={() => clearPaint(layer.id)}
        >
          <I.Trash size={14} /> Clear paint
        </button>
      )}
      {layer.hasMask && rt?.mask && (
        <button
          type="button"
          className="btn sm"
          onClick={() => clearMask(layer.id)}
        >
          <I.Undo size={14} /> Restore erased areas
        </button>
      )}
    </Section>
  )
}

export function LayersPanel() {
  const layers = useApp((s) => s.layers)
  const activeId = useApp((s) => s.activeLayer)
  const board = useApp((s) => s.board)
  const glyphLayer = useApp((s) => s.glyphLayer)
  const [where, setWhere] = useState<Placement>('above')
  const active = layers.find((l) => l.id === activeId) ?? null
  const ordered = [...layers].reverse()

  return (
    <>
      <Section title="Add">
        <div className="add-grid">
          <button type="button" className="add-tile" onClick={() => pickFiles(where)}>
            <I.Upload />
            <span>Files</span>
          </button>
          <button type="button" className="add-tile" onClick={() => void addCameraLayer(where)}>
            <I.Camera />
            <span>Camera</span>
          </button>
          <button type="button" className="add-tile" onClick={() => void addText(where)}>
            <I.Text />
            <span>Text</span>
          </button>
          <button
            type="button"
            className="add-tile"
            onClick={() => {
              if (!board) newBlankBoard(1)
              else {
                addPaintLayer(`Paint ${layers.filter((l) => l.kind === 'paint').length + 1}`, 'ink', where)
                useApp.getState().setTool('brush')
              }
            }}
          >
            <I.Brush />
            <span>Paint</span>
          </button>
        </div>
        {layers.length > 0 && (
          <Segmented
            size="sm"
            value={where}
            onChange={setWhere}
            options={[
              { value: 'above', label: 'Add above selected' },
              { value: 'below', label: 'Add below' },
            ]}
          />
        )}
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
        <Section
          title="Layers"
          aside={
            <span className="mono-dim">
              {board.width}×{board.height}
            </span>
          }
        >
          <ul className="layer-list" role="listbox" aria-label="Layers">
            <li
              role="option"
              aria-selected={activeId === GLYPH_LAYER}
              className={`layer-row glyphs ${activeId === GLYPH_LAYER ? 'on' : ''}`}
              onClick={() => selectLayer(GLYPH_LAYER)}
            >
              <span className="thumb glyph-thumb" aria-hidden="true">
                A✦
              </span>
              <span className="layer-name">
                Glyphs
                <small>{glyphLayer.count ? `${glyphLayer.count} cells` : 'Type & stamps'}</small>
              </span>
              {glyphLayer.count > 0 && (
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label="Clear glyphs"
                  title="Clear glyphs"
                  onClick={(e) => {
                    e.stopPropagation()
                    studio.edits.clear()
                    history.push({ label: 'Clear glyphs', undo: glyphUndo, redo: glyphRedo })
                    studio.applyEdits()
                    studio.syncEdits()
                  }}
                >
                  <I.Trash size={15} />
                </button>
              )}
              <button
                type="button"
                className="icon-btn sm"
                aria-label={glyphLayer.visible ? 'Hide glyphs' : 'Show glyphs'}
                onClick={(e) => {
                  e.stopPropagation()
                  useApp.setState({ glyphLayer: { ...glyphLayer, visible: !glyphLayer.visible } })
                }}
              >
                {glyphLayer.visible ? <I.Eye size={16} /> : <I.EyeOff size={16} />}
              </button>
            </li>
            {ordered.map((l) => (
              <li
                key={l.id}
                role="option"
                aria-selected={l.id === activeId}
                className={`layer-row ${l.id === activeId ? 'on' : ''} ${l.visible ? '' : 'hidden-layer'}`}
                onClick={() => selectLayer(l.id)}
              >
                <Thumb layer={l} />
                <span className="layer-name">
                  {l.name}
                  <small>
                    {KIND_LABEL[l.kind]}
                    {l.opacity < 1 ? ` · ${Math.round(l.opacity * 100)}%` : ''}
                    {l.blend !== 'source-over' ? ` · ${BLENDS.find((b) => b.value === l.blend)?.label}` : ''}
                  </small>
                </span>
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    updateLayer(l.id, { visible: !l.visible })
                  }}
                >
                  {l.visible ? <I.Eye size={16} /> : <I.EyeOff size={16} />}
                </button>
              </li>
            ))}
          </ul>
          {active && (
            <div className="row layer-actions">
              <button type="button" className="icon-btn sm" title="Bring forward" aria-label="Bring forward" onClick={() => moveLayer(active.id, 1)}>
                <I.Up size={16} />
              </button>
              <button type="button" className="icon-btn sm" title="Send backward" aria-label="Send backward" onClick={() => moveLayer(active.id, -1)}>
                <I.Down size={16} />
              </button>
              <button type="button" className="icon-btn sm" title="Duplicate" aria-label="Duplicate" onClick={() => duplicateLayer(active.id)}>
                <I.Duplicate size={16} />
              </button>
              <button type="button" className="icon-btn sm" title="Delete" aria-label="Delete layer" onClick={() => removeLayer(active.id)}>
                <I.Trash size={16} />
              </button>
            </div>
          )}
        </Section>
      )}

      {active && <LayerSettings layer={active} />}

      {board && (
        <Section title="Board">
          <Segmented
            size="sm"
            value=""
            onChange={(v: string) => setBoardAspect(v === 'auto' ? 'auto' : Number(v))}
            options={[
              { value: 'auto', label: 'Original' },
              { value: '1', label: '1:1' },
              { value: String(4 / 5), label: '4:5' },
              { value: String(3 / 2), label: '3:2' },
              { value: String(16 / 9), label: '16:9' },
              { value: String(9 / 16), label: '9:16' },
            ]}
          />
        </Section>
      )}
    </>
  )
}
