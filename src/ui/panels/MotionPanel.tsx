import { ANIMATIONS } from '../../anim/animations'
import { startRecording, stopRecording } from '../../app/recorder'
import { useApp } from '../../state/store'
import { ColorField, Hint, Section, Slider, Toggle } from '../controls'
import { I } from '../icons'
import { INTERACTIONS } from '../interactions'

const GLYPH: Record<string, string> = {
  none: '·',
  decode: '#?@',
  matrix: '¦:|',
  wave: '~∿~',
  glitch: '▚▞',
  assemble: '·:•',
  ripple: '◎',
  holo: '◆◇',
  pulse: '•●•',
  crt: '═',
  silk: '≈≋',
  kaleido: '✳',
  burn: '░▒▓',
  shatter: '◤◢',
  tilt: '◇◆',
  glitter: '✦·+',
  warp: '·∗✳',
  runway: '◐',
}

const ICON: Record<string, string> = {
  repel: '⟵●⟶',
  attract: '⟶●⟵',
  swirl: '⟳',
  lens: '◎',
  ripple: '≋',
  burst: '✺',
  spotlight: '◐',
  trail: '•∙·',
  tilt: '◇',
  off: '—',
}

export function MotionPanel() {
  const motion = useApp((s) => s.motion)
  const set = useApp((s) => s.setMotion)
  const interaction = useApp((s) => s.interaction)
  const setInteraction = useApp((s) => s.setInteraction)
  const recording = useApp((s) => s.recording)
  const recPointer = useApp((s) => s.ui.recPointer)
  const setUi = useApp((s) => s.setUi)
  const setTool = useApp((s) => s.setTool)
  return (
    <>
      <Section
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
              aria-pressed={motion.animation === a.id}
            >
              <span className="anim-glyph">{GLYPH[a.id] ?? '·'}</span>
              <span className="anim-name">{a.name}</span>
            </button>
          ))}
        </div>
        <Hint>{ANIMATIONS.find((a) => a.id === motion.animation)?.hint}. Every animation loops seamlessly for GIF, video and web embeds.</Hint>
      </Section>

      <Section title="Timing">
        <Slider label="Speed" value={motion.speed} min={0.1} max={3} onChange={(speed) => set({ speed })} format={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Intensity" value={motion.intensity} min={0} max={1} onChange={(intensity) => set({ intensity })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Loop length" value={motion.duration} min={1} max={12} step={0.5} onChange={(duration) => set({ duration })} format={(v) => `${v}s`} />
        <ColorField label="Highlight" value={motion.highlight} onChange={(highlight) => set({ highlight })} />
      </Section>

      <Section title="Interaction">
        <div className="anim-grid">
          {INTERACTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`anim ${interaction.mode === m.id ? 'on' : ''}`}
              title={m.hint}
              aria-pressed={interaction.mode === m.id}
              onClick={() => {
                setInteraction({ mode: m.id })
                if (m.id !== 'off') setTool('interact')
              }}
            >
              <span className="anim-glyph">{ICON[m.id]}</span>
              <span className="anim-name">{m.name}</span>
            </button>
          ))}
        </div>
        <Hint>{INTERACTIONS.find((m) => m.id === interaction.mode)?.hint}. Works on photos, video and camera, on top of any animation, and in web embeds.</Hint>
        <Slider label="Power" value={interaction.strength} min={0.1} max={1} onChange={(strength) => setInteraction({ strength })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Reach" value={interaction.radius} min={3} max={40} step={1} onChange={(radius) => setInteraction({ radius })} format={(v) => `${v} cells`} />
      </Section>

      <Section title="Recording">
        <Hint>Record the board while you play with it. Animations, video layers and your gestures are captured live.</Hint>
        <Toggle label="Show touch points" hint="Draws a soft dot where you point or tap" checked={recPointer} onChange={(v) => setUi({ recPointer: v })} />
        {recording ? (
          <button type="button" className="btn wide rec-wide live" onClick={() => void stopRecording()}>
            <i className="rec-dot" /> Stop recording
          </button>
        ) : (
          <button type="button" className="btn wide rec-wide" onClick={() => startRecording(recPointer)}>
            <i className="rec-dot" /> Start recording
          </button>
        )}
      </Section>
    </>
  )
}
