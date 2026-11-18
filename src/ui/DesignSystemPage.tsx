/**
 * Living style guide (open with #design-system). Everything here is rendered
 * from the real tokens and primitives, so it cannot drift from the app.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ACCENTS, useApp } from '../state/store'
import { ColorField, Hint, Section, Segmented, Slider, Toggle } from './controls'
import { Badge, Button, IconButton, Kbd, Tile } from './ds'
import { I } from './icons'

const COLORS: [string, string][] = [
  ['--color-paper', 'App chrome'],
  ['--color-surface', 'Raised: inputs, cards, popovers'],
  ['--color-sunken', 'Wells, tracks, hover'],
  ['--color-stage', 'Field around the artwork'],
  ['--color-ink', 'Primary text and icons'],
  ['--color-ink-2', 'Secondary text'],
  ['--color-ink-3', 'Hints, meta (AA on paper)'],
  ['--color-line-strong', 'Control borders'],
  ['--color-accent', 'The one loud color'],
  ['--color-danger', 'Recording, destructive'],
]

const TYPE: [string, string, ReactNode][] = [
  ['t-display', 'Display · serif · 3xl', <>Every image, <em>set in type.</em></>],
  ['t-title', 'Title · serif · xl', <>Export <em>the piece</em></>],
  ['t-caption', 'Caption · serif italic · lg', 'Pl. I — Rose'],
  ['', 'Body · sans · md', 'Layer photos, video and drawings on one board.'],
  ['t-label', 'Label · mono caps · 2xs', 'Shape · Style · Motion'],
  ['t-meta', 'Meta · mono · xs', '160 × 90 cells · 12,480 glyphs · 60 fps'],
]

const SPACE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]
const RADII = ['xs', 'sm', 'md', 'lg', 'pill']
const SHADOWS = ['1', '2', '3', 'art']

/** Prints a token's resolved value; re-reads after the theme effect has run. */
function TokenValue({ name, dep }: { name: string; dep: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (ref.current) ref.current.textContent = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    })
    return () => cancelAnimationFrame(id)
  }, [name, dep])
  return <span ref={ref} className="t-meta" />
}

function Block({ id, title, lede, children }: { id: string; title: string; lede: string; children: ReactNode }) {
  return (
    <section className="ds-section" id={id}>
      <header>
        <span className="t-label">{id}</span>
        <h2 className="t-title" style={{ margin: 0 }}>
          {title}
        </h2>
        <p>{lede}</p>
      </header>
      <div>{children}</div>
    </section>
  )
}

export function DesignSystemPage() {
  const ui = useApp((s) => s.ui)
  const setUi = useApp((s) => s.setUi)
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a')
  const [range, setRange] = useState(0.6)
  const [on, setOn] = useState(true)
  const [color, setColor] = useState('#d6204f')
  const [tile, setTile] = useState(1)

  return (
    <div className="ds-page">
      <div className="ds-wrap">
        <header className="ds-head">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="t-label">ASCII Atelier · Design system · v2</span>
            <div className="row">
              <IconButton label={ui.theme === 'dark' ? 'Light mode' : 'Dark mode'} icon={ui.theme === 'dark' ? <I.Sun /> : <I.Moon />} onClick={() => setUi({ theme: ui.theme === 'dark' ? 'light' : 'dark' })} />
              <Button variant="secondary" icon={<I.Arrow style={{ transform: 'rotate(180deg)' }} />} onClick={() => (location.hash = '')}>
                Back to the studio
              </Button>
            </div>
          </div>
          <h1 className="t-display" style={{ margin: 0 }}>
            Paper, ink <em>&amp; one accent.</em>
          </h1>
          <p className="lede">
            The studio is a quiet frame for loud art. Chrome is paper and ink with hairline dividers; color is reserved for the work and for a single accent that
            marks what is active. Serif speaks, sans works, mono measures.
          </p>
          <nav aria-label="Sections">
            {['color', 'type', 'space', 'shape', 'elevation', 'motion', 'components', 'patterns'].map((s) => (
              <a key={s} className="chip" href={`#ds-${s}`} onClick={(e) => (e.preventDefault(), document.getElementById(s)?.scrollIntoView({ behavior: 'smooth' }))}>
                {s}
              </a>
            ))}
          </nav>
        </header>

        <Block id="color" title="Color roles" lede="Components use roles, never hex values. Dark mode swaps the values, not the roles. The accent is user-selectable.">
          <div className="ds-grid">
            {COLORS.map(([n, use]) => (
              <div key={n} className="ds-swatch">
                <i style={{ background: `var(${n})` }} />
                <b>{n.replace('--color-', '')}</b>
                <TokenValue name={n} dep={ui.theme + ui.accent} />
                <span className="hint">{use}</span>
              </div>
            ))}
          </div>
          <div className="ds-demo" style={{ marginTop: 'var(--space-6)' }}>
            <span className="field-label">Accent</span>
            <div className="accents" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={ui.accent === a.color} aria-label={a.name} className={ui.accent === a.color ? 'is-on' : ''} style={{ background: a.color }} onClick={() => setUi({ accent: a.color })} />
              ))}
            </div>
          </div>
        </Block>

        <Block id="type" title="Typography" lede="Three voices. Instrument Serif for titles and captions, the system sans for controls, JetBrains Mono for labels, values and the art itself.">
          <div className="ds-rows">
            {TYPE.map(([cls, name, sample]) => (
              <div key={name} className="ds-row">
                <span className="t-meta">{name}</span>
                <span className={cls} style={cls === 't-display' ? { fontSize: 'clamp(36px, 5vw, 64px)' } : undefined}>
                  {sample}
                </span>
              </div>
            ))}
          </div>
        </Block>

        <Block id="space" title="Space" lede="A 4-point scale. Panels pad at 20, sections breathe at 20, controls sit 8–16 apart.">
          <div className="ds-rows">
            {SPACE.map((n) => (
              <div key={n} className="ds-row">
                <span className="t-meta">
                  space-{n} · {n * 4}px
                </span>
                <span className="ds-bar" style={{ width: `var(--space-${n})` }} />
              </div>
            ))}
          </div>
        </Block>

        <Block id="shape" title="Shape" lede="Radii grow with the surface: 6 for small marks, 10 for controls, 14 for tiles and popovers, 20 for dialogs. Pills for chips and primary actions.">
          <div className="ds-grid">
            {RADII.map((r) => (
              <div key={r} className="ds-swatch">
                <span className="ds-box" style={{ borderRadius: `var(--radius-${r})`, boxShadow: 'inset 0 0 0 1px var(--color-line-strong)' }}>
                  radius-{r}
                </span>
              </div>
            ))}
          </div>
        </Block>

        <Block id="elevation" title="Elevation" lede="Four steps. Hairlines for docked chrome, 2 for popovers and floating bars, 3 for dialogs. The artwork gets its own deep, warm shadow.">
          <div className="ds-grid">
            {SHADOWS.map((s) => (
              <span key={s} className="ds-box" style={{ borderRadius: 'var(--radius-md)', boxShadow: `var(--shadow-${s})` }}>
                shadow-{s}
              </span>
            ))}
          </div>
        </Block>

        <Block id="motion" title="Motion" lede="Fast and quiet: 120ms for hover and press, 200ms for state, 320ms for entrances. Springs only for toggles. All of it stops under reduced motion.">
          <div className="ds-rows">
            {[
              ['dur-1 · 120ms', 'hover, press'],
              ['dur-2 · 200ms', 'state changes'],
              ['dur-3 · 320ms', 'dialogs, sheets'],
              ['ease-out', 'cubic-bezier(.2,.9,.3,1)'],
              ['ease-spring', 'cubic-bezier(.3,1.45,.5,1)'],
            ].map(([a, b]) => (
              <div key={a} className="ds-row">
                <span className="t-meta">{a}</span>
                <span className="hint">{b}</span>
              </div>
            ))}
          </div>
          <div className="ds-demo ds-motion" style={{ marginTop: 'var(--space-4)' }}>
            <i style={{ animationTimingFunction: 'var(--ease-out)' }} />
          </div>
        </Block>

        <Block id="components" title="Components" lede="Every control in the studio is one of these. Variants carry meaning: primary is the one action that finishes a task.">
          <div className="ds-demo">
            <Button variant="primary" icon={<I.Download />}>
              Primary
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" className="is-live" icon={<i className="rec-dot" />}>
              Danger
            </Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
            <Button variant="secondary" size="sm">
              Small
            </Button>
          </div>
          <div className="ds-demo">
            <IconButton label="Undo" icon={<I.Undo />} />
            <IconButton label="Compare" icon={<I.Compare />} pressed />
            <IconButton label="Delete" size="sm" icon={<I.Trash size={16} />} />
            <span className="chip">Chip</span>
            <span className="chip is-on">Selected chip</span>
            <Kbd>⌘K</Kbd>
            <Badge>Badge</Badge>
            <Badge tone="accent">Accent</Badge>
            <button type="button" className="link">
              Link
            </button>
          </div>
          <div className="ds-demo col">
            <Segmented
              label="Segmented"
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'a', label: 'Density' },
                { value: 'b', label: 'Contour' },
                { value: 'c', label: 'Braille' },
              ]}
            />
            <Slider label="Slider" value={range} min={0} max={1} onChange={setRange} format={(v) => `${Math.round(v * 100)}%`} />
            <Toggle label="Toggle" hint="Secondary text explains the consequence" checked={on} onChange={setOn} />
            <ColorField label="Color field" value={color} onChange={setColor} />
            <input className="input" placeholder="Text input" />
          </div>
          <div className="ds-demo col">
            <div className="tile-grid">
              {['◎', '✦·+', '≈≋', '░▒▓'].map((g, i) => (
                <Tile key={g} size="sm" emblem={g} label={['Ripple', 'Glitter', 'Silk', 'Burn'][i]} selected={tile === i} onClick={() => setTile(i)} />
              ))}
            </div>
          </div>
        </Block>

        <Block id="patterns" title="Patterns" lede="How the pieces compose: titled sections with mono caps, secondary settings behind a disclosure, the panel never scrolls sideways.">
          <div className="ds-demo col" style={{ maxWidth: 360 }}>
            <Section title="Section" aside={<span className="t-meta">aside</span>}>
              <Hint>A section groups related controls under a quiet label.</Hint>
            </Section>
            <Section title="Advanced" collapsible defaultOpen={false}>
              <Hint>Progressive disclosure keeps rarely-used settings out of the way.</Hint>
            </Section>
          </div>
          <div className="ds-rows" style={{ marginTop: 'var(--space-6)' }}>
            {[
              ['Hierarchy', 'Art → primary action → current tool → settings → meta. Size, contrast and color follow that order.'],
              ['One accent', 'Accent marks the active thing (tab, tool dot, selection, primary). Never decoration.'],
              ['Docked chrome', 'Panels are docked with hairlines on desktop; they float only on phones, over the art.'],
              ['Words', 'Verbs on buttons (Add files, Download PNG). Hints say what happens, not how it works.'],
            ].map(([a, b]) => (
              <div key={a} className="ds-row">
                <span className="t-caption">{a}</span>
                <span className="hint">{b}</span>
              </div>
            ))}
          </div>
        </Block>
      </div>
    </div>
  )
}
