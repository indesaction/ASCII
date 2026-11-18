import { useState } from 'react'
import { getAnimation } from '../../anim/animations'
import { studio } from '../../app/studio'
import { extractPalette, rgbToHex } from '../../engine/color'
import { resolvePalette, thumbnailPixels } from '../../engine/convert'
import { GRADIENTS, LOOKS, PALETTES } from '../../engine/presets'
import { useApp } from '../../state/store'
import { ColorField, Section, Segmented, Slider, Toggle } from '../controls'
import { I } from '../icons'

export function StylePanel() {
  const style = useApp((s) => s.style)
  const set = useApp((s) => s.setStyle)
  const hasSource = useApp((s) => s.layers.length > 0)
  const [k, setK] = useState(5)

  const applyLook = (id: string) => {
    const look = LOOKS.find((l) => l.id === id)
    if (!look) return
    const s = useApp.getState()
    if (look.shape) s.setShape(look.shape)
    if (look.style) s.setStyle({ cellTint: 0, ...look.style })
    if (look.motion) {
      const anim = look.motion.animation
      s.setMotion({ ...look.motion, ...(anim ? { duration: getAnimation(anim).duration, playing: true } : {}) })
    }
  }

  const extract = (target: 'palette' | 'gradient') => {
    const c = studio.composite
    const pal = extractPalette(thumbnailPixels({ el: c, width: c.width, height: c.height }), k).map((c) => rgbToHex(c[0], c[1], c[2]))
    if (target === 'palette') set({ customPalette: pal, paletteId: 'custom', colorMode: 'palette' })
    else {
      const stops = pal.length > 3 ? [pal[0], pal[Math.floor(pal.length / 2)], pal[pal.length - 1]] : pal
      set({ gradient: stops, colorMode: 'gradient', gradientAxis: 'tone' })
    }
  }

  const palette = resolvePalette(style)

  return (
    <>
      <Section title="Looks">
        <div className="look-grid">
          {LOOKS.map((l) => (
            <button key={l.id} type="button" className="look" onClick={() => applyLook(l.id)}>
              <span className="look-swatch" style={{ background: l.swatch[0], color: l.swatch[1] }}>
                Aa
              </span>
              <span>{l.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Color">
        <Segmented
          value={style.colorMode}
          onChange={(colorMode) => set({ colorMode })}
          options={[
            { value: 'mono', label: 'Mono' },
            { value: 'source', label: 'Source' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'palette', label: 'Palette' },
          ]}
        />
        <div className="row two">
          {style.colorMode === 'mono' && <ColorField label="Ink" value={style.ink} onChange={(ink) => set({ ink })} />}
          <ColorField label="Background" value={style.background} onChange={(background) => set({ background })} />
        </div>
        <Toggle
          label="Transparent background"
          hint="PNG, SVG and web embeds export without a backdrop"
          checked={style.transparent}
          onChange={(transparent) => set({ transparent })}
        />

        {style.colorMode === 'source' && (
          <Slider label="Saturation" value={style.saturation} min={0} max={2.5} onChange={(saturation) => set({ saturation })} format={(v) => `${Math.round(v * 100)}%`} />
        )}

        {style.colorMode === 'gradient' && (
          <>
            <div className="gradient-bar" style={{ background: `linear-gradient(90deg, ${style.gradient.join(', ')})` }} />
            <div className="row stops">
              {style.gradient.map((c, i) => (
                <ColorField
                  key={i}
                  compact
                  label={`Stop ${i + 1}`}
                  value={c}
                  onChange={(v) => set({ gradient: style.gradient.map((g, j) => (j === i ? v : g)) })}
                />
              ))}
              {style.gradient.length < 5 && (
                <button type="button" className="icon-btn" title="Add stop" onClick={() => set({ gradient: [...style.gradient, style.gradient[style.gradient.length - 1]] })}>
                  <I.Plus />
                </button>
              )}
              {style.gradient.length > 2 && (
                <button type="button" className="icon-btn" title="Remove stop" onClick={() => set({ gradient: style.gradient.slice(0, -1) })}>
                  <I.Minus />
                </button>
              )}
            </div>
            <div className="chips">
              {GRADIENTS.map((g) => (
                <button key={g.id} type="button" className="chip swatchy" onClick={() => set({ gradient: g.stops })}>
                  <i style={{ background: `linear-gradient(90deg, ${g.stops.join(', ')})` }} />
                  {g.name}
                </button>
              ))}
            </div>
            <Segmented
              size="sm"
              label="Map by"
              value={style.gradientAxis}
              onChange={(gradientAxis) => set({ gradientAxis })}
              options={[
                { value: 'tone', label: 'Tone' },
                { value: 'x', label: '→' },
                { value: 'y', label: '↓' },
                { value: 'diagonal', label: '↘' },
                { value: 'radial', label: '◎' },
              ]}
            />
          </>
        )}

        {style.colorMode === 'palette' && (
          <>
            <div className="chips">
              {PALETTES.filter((p) => p.id !== 'custom' || style.customPalette.length).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip swatchy ${style.paletteId === p.id ? 'on' : ''}`}
                  onClick={() => set({ paletteId: p.id })}
                >
                  <i style={{ background: `linear-gradient(90deg, ${(p.id === 'custom' ? style.customPalette : p.colors).join(', ')})` }} />
                  {p.name}
                </button>
              ))}
            </div>
            <div className="palette-row">
              {palette.map((c, i) => (
                <span key={i} style={{ background: c }} title={c} />
              ))}
            </div>
          </>
        )}

        {hasSource && (
          <div className="extract">
            <Slider label="Extract colors from image" value={k} min={2} max={8} step={1} onChange={setK} format={(v) => `${v} colors`} />
            <div className="row">
              <button type="button" className="btn" onClick={() => extract('palette')}>
                <I.Sparkle /> As palette
              </button>
              <button type="button" className="btn" onClick={() => extract('gradient')}>
                <I.Sparkle /> As gradient
              </button>
            </div>
          </div>
        )}

        <Slider
          label="Cell tint"
          value={style.cellTint}
          min={0}
          max={0.8}
          onChange={(cellTint) => set({ cellTint })}
          format={(v) => `${Math.round(v * 100)}%`}
          hint="Paints a soft block of each glyph's color behind it"
        />
      </Section>

      <Section title="Typography">
        <Slider label="Size" value={style.fontSize} min={5} max={32} step={0.5} onChange={(fontSize) => set({ fontSize })} format={(v) => `${v}px`} />
        <Slider label="Line height" value={style.lineHeight} min={0.6} max={1.8} onChange={(lineHeight) => set({ lineHeight })} format={(v) => v.toFixed(2)} />
        <Slider label="Tracking" value={style.letterSpacing} min={-2} max={8} step={0.1} onChange={(letterSpacing) => set({ letterSpacing })} format={(v) => `${v.toFixed(1)}px`} />
        <Slider label="Margin" value={style.padding} min={0} max={12} step={1} onChange={(padding) => set({ padding })} format={(v) => `${v} cells`} />
        <Segmented
          size="sm"
          label="Weight"
          value={style.weight}
          onChange={(weight) => set({ weight })}
          options={[
            { value: 400, label: 'Regular' },
            { value: 700, label: <b>Bold</b> },
          ]}
        />
      </Section>

      <Section title="Print">
        <Toggle
          label="CMYK soft proof"
          hint="Simulates process inks on paper so you can spot colors that will print dull"
          checked={style.proof}
          onChange={(proof) => set({ proof })}
        />
      </Section>
    </>
  )
}
