import { CHARSETS } from '../../engine/presets'
import { DEFAULT_SHAPE, useApp } from '../../state/store'
import { Hint, Section, Segmented, Slider, Toggle } from '../controls'

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`

export function ShapePanel() {
  const shape = useApp((s) => s.shape)
  const set = useApp((s) => s.setShape)
  const rows = useApp((s) => s.stats.rows)
  const usesCharset = shape.mode === 'density' || shape.mode === 'contour'
  return (
    <>
      <Section title="Mode">
        <Segmented
          value={shape.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'density', label: 'Density', title: 'Glyphs by brightness' },
            { value: 'contour', label: 'Contour', title: 'Edge-following line glyphs — great for vectors' },
            { value: 'braille', label: 'Braille', title: '2×4 dots per cell — 8× the detail' },
            { value: 'pixels', label: 'Pixels', title: 'Half-block pixels with two colors per cell' },
            { value: 'phrase', label: 'Phrase', title: 'Your words become the image' },
          ]}
        />
        <Hint>
          {shape.mode === 'density' && 'Each cell picks a glyph whose ink density matches the image tone.'}
          {shape.mode === 'contour' && 'Detects edges and draws them with / | \\ — strokes. Perfect for vector logos.'}
          {shape.mode === 'braille' && 'Braille dots give eight sub-pixels per character for very fine detail.'}
          {shape.mode === 'pixels' && 'Half blocks ▀ with separate top and bottom colors — a crisp pixel-art look.'}
          {shape.mode === 'phrase' && 'A typographic portrait: your phrase repeats across the image.'}
        </Hint>
        <Slider
          label="Columns"
          value={shape.columns}
          min={16}
          max={320}
          step={1}
          onChange={(columns) => set({ columns })}
          format={(v) => `${v} × ${rows || '–'}`}
        />
      </Section>

      {usesCharset && (
        <Section title="Characters">
          <div className="chips">
            {CHARSETS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${shape.charsetId === c.id ? 'is-on' : ''}`}
                onClick={() => set({ charsetId: c.id })}
                title={c.chars}
              >
                {c.name}
              </button>
            ))}
          </div>
          {shape.charsetId === 'custom' ? (
            <input
              className="input mono"
              value={shape.customCharset}
              placeholder="Type any characters, light → dense"
              onChange={(e) => set({ customCharset: e.target.value })}
            />
          ) : (
            <code className="charset-preview">{CHARSETS.find((c) => c.id === shape.charsetId)?.chars}</code>
          )}
          <Toggle
            label="Calibrate by ink density"
            hint="Measures every glyph and orders it by real ink coverage"
            checked={!shape.keepOrder}
            onChange={(v) => set({ keepOrder: !v })}
          />
          {shape.mode === 'density' && (
            <Toggle
              label="Shape matching"
              hint="Chooses glyphs by their silhouette, not just brightness — sharper edges"
              checked={shape.detail}
              onChange={(detail) => set({ detail })}
            />
          )}
        </Section>
      )}

      {shape.mode === 'phrase' && (
        <Section title="Phrase">
          <input
            className="input"
            value={shape.phrase}
            placeholder="Your words"
            onChange={(e) => set({ phrase: e.target.value })}
          />
          <Segmented
            size="sm"
            value={shape.phraseShading}
            onChange={(phraseShading) => set({ phraseShading })}
            options={[
              { value: 'opacity', label: 'Tone by opacity' },
              { value: 'threshold', label: 'Cut-out' },
            ]}
          />
          {shape.phraseShading === 'threshold' && (
            <Slider
              label="Threshold"
              value={shape.threshold}
              min={0.02}
              max={0.98}
              onChange={(threshold) => set({ threshold })}
              format={(v) => v.toFixed(2)}
            />
          )}
        </Section>
      )}

      {(shape.mode === 'density' || shape.mode === 'braille') && !(shape.mode === 'density' && shape.detail) && (
        <Section title="Dithering" collapsible defaultOpen={shape.dither !== 'none'}>
          <Segmented
            size="sm"
            value={shape.dither}
            onChange={(dither) => set({ dither })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'floyd', label: 'Floyd' },
              { value: 'atkinson', label: 'Atkinson' },
              { value: 'bayer', label: 'Bayer' },
            ]}
          />
          {shape.mode === 'braille' && (
            <Slider
              label="Dot threshold"
              value={shape.threshold}
              min={0.05}
              max={0.95}
              onChange={(threshold) => set({ threshold })}
              format={(v) => v.toFixed(2)}
            />
          )}
        </Section>
      )}

      {shape.mode === 'contour' && (
        <Section title="Edges">
          <Slider
            label="Sensitivity"
            value={1 - shape.edgeThreshold}
            min={0.3}
            max={0.97}
            onChange={(v) => set({ edgeThreshold: 1 - v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Toggle label="Fill between edges" checked={shape.edgeFill} onChange={(edgeFill) => set({ edgeFill })} />
        </Section>
      )}

      <Section
        title="Tone"
        collapsible
        aside={
          <button
            type="button"
            className="link"
            onClick={(e) => {
              // Inside the disclosure summary: don't toggle it.
              e.preventDefault()
              set({
                brightness: DEFAULT_SHAPE.brightness,
                contrast: DEFAULT_SHAPE.contrast,
                gamma: DEFAULT_SHAPE.gamma,
                invert: false,
              })
            }}
          >
            Reset
          </button>
        }
      >
        <Slider label="Brightness" value={shape.brightness} min={-1} max={1} onChange={(brightness) => set({ brightness })} format={pct} />
        <Slider label="Contrast" value={shape.contrast} min={-1} max={1} onChange={(contrast) => set({ contrast })} format={pct} />
        <Slider label="Gamma" value={shape.gamma} min={0.3} max={3} onChange={(gamma) => set({ gamma })} format={(v) => v.toFixed(2)} />
        <Toggle label="Invert" checked={shape.invert} onChange={(invert) => set({ invert })} />
        <Toggle
          label="Ink from transparency"
          hint="Shapes follow transparent edges only, ignoring brightness — ideal for logos and cut-outs"
          checked={shape.alphaInk}
          onChange={(alphaInk) => set({ alphaInk })}
        />
      </Section>
    </>
  )
}
