import { useMemo } from 'react'
import { clearEdits, redo, undo } from '../../app/editor'
import { BRUSH_CHARS } from '../../engine/presets'
import { charsetString } from '../../engine/ramp'
import { useApp, type Tool } from '../../state/store'
import { TOOLS } from '../tools'
import { ColorField, Hint, Section, Segmented, Slider } from '../controls'
import { I } from '../icons'


const TOOL_HINT: Record<Tool, string> = {
  brush: 'Paint the selected glyph. Drag for strokes.',
  type: 'Tap a cell, then type. Arrows move, Enter jumps to the next line.',
  erase: 'Clear glyphs to empty space.',
  fill: 'Flood-fill every touching cell that has the same glyph.',
  shade: 'Each pass steps a glyph denser along the tone ramp. Hold Alt (or choose Lighten) to go lighter.',
  recolor: 'Repaint colors and keep the glyphs.',
  line: 'Drag to draw a straight line of glyphs.',
  rect: 'Drag to draw a box outline.',
  pick: 'Tap a cell to pick up its glyph and color.',
  pan: 'Look without editing — scroll and pinch freely.',
}

export function EditPanel() {
  const editor = useApp((s) => s.editor)
  const set = useApp((s) => s.setEditor)
  const edits = useApp((s) => s.edits)
  const shape = useApp((s) => s.shape)
  const glyphChoices = useMemo(() => {
    const set = new Set<string>()
    for (const ch of charsetString(shape)) if (ch !== ' ') set.add(ch)
    for (const ch of BRUSH_CHARS) set.add(ch)
    return [...set].slice(0, 72)
  }, [shape])

  return (
    <>
      <Section n="01" title="Tools">
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tool ${editor.tool === t.id ? 'on' : ''}`}
              onClick={() => set({ tool: t.id })}
              title={`${t.name} (${t.key})`}
            >
              {t.icon}
              <span>{t.name}</span>
            </button>
          ))}
        </div>
        <Hint>{TOOL_HINT[editor.tool]}</Hint>
        {editor.tool === 'shade' && (
          <Segmented
            size="sm"
            value={editor.shadeDir}
            onChange={(shadeDir) => set({ shadeDir })}
            options={[
              { value: 1, label: 'Darken ▲' },
              { value: -1, label: 'Lighten ▼' },
            ]}
          />
        )}
        <Slider label="Brush size" value={editor.size} min={1} max={9} step={1} onChange={(size) => set({ size })} format={(v) => `${v}`} />
      </Section>

      <Section n="02" title="Glyph">
        <div className="glyph-pick">
          <input
            className="glyph-input"
            value={editor.char}
            maxLength={4}
            aria-label="Brush glyph"
            onChange={(e) => {
              const ch = [...e.target.value].pop()
              if (ch) set({ char: ch })
            }}
          />
          <div className="glyph-grid">
            {glyphChoices.map((ch) => (
              <button key={ch} type="button" className={editor.char === ch ? 'on' : ''} onClick={() => set({ char: ch })}>
                {ch}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section n="03" title="Paint">
        <Segmented
          size="sm"
          value={editor.colorMode}
          onChange={(colorMode) => set({ colorMode })}
          options={[
            { value: 'keep', label: 'Keep colors' },
            { value: 'paint', label: 'Paint color' },
          ]}
        />
        {(editor.colorMode === 'paint' || editor.tool === 'recolor') && (
          <ColorField label="Brush color" value={editor.color} onChange={(color) => set({ color })} />
        )}
      </Section>

      <Section n="04" title="History" aside={<span className="mono-dim">{edits.count} edited cells</span>}>
        <div className="row">
          <button type="button" className="btn" disabled={!edits.canUndo} onClick={undo}>
            <I.Undo /> Undo
          </button>
          <button type="button" className="btn" disabled={!edits.canRedo} onClick={redo}>
            <I.Redo /> Redo
          </button>
          <button type="button" className="btn" disabled={!edits.count} onClick={clearEdits}>
            <I.Trash /> Clear
          </button>
        </div>
        <Hint>Edits live on their own layer above the conversion — keep tweaking style and motion, your work stays.</Hint>
      </Section>
    </>
  )
}
