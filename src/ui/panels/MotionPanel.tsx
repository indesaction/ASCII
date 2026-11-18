import { ANIMATIONS } from '../../anim/animations'
import { useApp } from '../../state/store'
import { ColorField, Hint, Section, Slider, Toggle } from '../controls'
import { I } from '../icons'

const GLYPH: Record<string, string> = {
  none: '·',
  decode: '#?@',
  matrix: '¦:|',
  wave: '~∿~',
  glitch: '▚▞',
  typewriter: 'ab▌',
  assemble: '·:•',
  ripple: '◎',
  holo: '◆◇',
  vortex: '@',
  pulse: '•●•',
  fall: '↓',
  crt: '═',
}

export function MotionPanel() {
  const motion = useApp((s) => s.motion)
  const set = useApp((s) => s.setMotion)
  return (
    <>
      <Section
        n="01"
        title="Animation"
        aside={
          motion.animation !== 'none' && (
            <button type="button" className="btn sm" onClick={() => set({ playing: !motion.playing })}>
              {motion.playing ? <I.Pause size={14} /> : <I.Play size={14} />}
              {motion.playing ? 'Pause' : 'Play'}
            </button>
          )
        }
      >
        <div className="anim-grid">
          {ANIMATIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`anim ${motion.animation === a.id ? 'on' : ''}`}
              onClick={() => set({ animation: a.id, duration: a.duration, playing: true })}
              title={a.hint}
            >
              <span className={`anim-glyph g-${a.id}`}>{GLYPH[a.id] ?? '·'}</span>
              <span className="anim-name">{a.name}</span>
            </button>
          ))}
        </div>
        <Hint>{ANIMATIONS.find((a) => a.id === motion.animation)?.hint}. Every animation loops seamlessly for GIF, video and web embeds.</Hint>
      </Section>

      <Section n="02" title="Timing">
        <Slider label="Speed" value={motion.speed} min={0.1} max={3} onChange={(speed) => set({ speed })} format={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Intensity" value={motion.intensity} min={0} max={1} onChange={(intensity) => set({ intensity })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Loop length" value={motion.duration} min={1} max={12} step={0.5} onChange={(duration) => set({ duration })} format={(v) => `${v}s`} />
        <ColorField label="Highlight" value={motion.highlight} onChange={(highlight) => set({ highlight })} />
      </Section>

      <Section n="03" title="Interaction">
        <Toggle
          label={
            <>
              <I.Magnet size={14} /> Magnetic cursor
            </>
          }
          hint="Glyphs scatter away from your pointer or finger — also in web embeds"
          checked={motion.magnet}
          onChange={(magnet) => set({ magnet })}
        />
      </Section>
    </>
  )
}
