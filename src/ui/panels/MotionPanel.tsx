import { ANIMATIONS } from '../../anim/animations'
import { startRecording, stopRecording } from '../../app/recorder'
import { useApp } from '../../state/store'
import { ColorField, Hint, Section, Slider, Toggle } from '../controls'
import { Button, Tile } from '../ds'
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
            <Button size="sm" icon={motion.playing ? <I.Pause size={14} /> : <I.Play size={14} />} onClick={() => set({ playing: !motion.playing })}>
              {motion.playing ? 'Pause' : 'Play'}
            </Button>
          )
        }
      >
        <div className="tile-grid">
          {ANIMATIONS.map((a) => (
            <Tile key={a.id} size="sm" selected={motion.animation === a.id} emblem={GLYPH[a.id] ?? '·'} label={a.name} title={a.hint} onClick={() => set({ animation: a.id, duration: a.duration, playing: true })} />
          ))}
        </div>
        <Hint>{ANIMATIONS.find((a) => a.id === motion.animation)?.hint}. Every animation loops seamlessly for GIF, video and web embeds.</Hint>
      </Section>

      <Section title="Timing" collapsible>
        <Slider label="Speed" value={motion.speed} min={0.1} max={3} onChange={(speed) => set({ speed })} format={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Intensity" value={motion.intensity} min={0} max={1} onChange={(intensity) => set({ intensity })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Loop length" value={motion.duration} min={1} max={12} step={0.5} onChange={(duration) => set({ duration })} format={(v) => `${v}s`} />
        <ColorField label="Highlight" value={motion.highlight} onChange={(highlight) => set({ highlight })} />
      </Section>

      <Section title="Interaction">
        <div className="tile-grid">
          {INTERACTIONS.map((m) => (
            <Tile
              key={m.id}
              size="sm"
              selected={interaction.mode === m.id}
              emblem={ICON[m.id]}
              label={m.name}
              title={m.hint}
              onClick={() => {
                setInteraction({ mode: m.id })
                if (m.id !== 'off') setTool('interact')
              }}
            />
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
          <Button variant="danger" wide className="is-live" icon={<i className="rec-dot" />} onClick={() => void stopRecording()}>
            Stop recording
          </Button>
        ) : (
          <Button variant="secondary" wide icon={<i className="rec-dot" />} onClick={() => startRecording(recPointer)}>
            Start recording
          </Button>
        )}
      </Section>
    </>
  )
}
