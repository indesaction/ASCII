import { useEffect, useReducer, useRef, useState } from 'react'
import { pickFile, toggleCamera } from '../../app/actions'
import { freezeLive, openText, refreshText, SAMPLES, startCamera } from '../../app/sources'
import { studio } from '../../app/studio'
import { useApp } from '../../state/store'
import { Hint, Section, Segmented, Toggle } from '../controls'
import { I } from '../icons'

const SAMPLE_GLYPH: Record<string, string> = { orb: '●', bloom: '✺', aura: '░▒▓', type: 'Aa' }

export function SourcePanel() {
  const source = useApp((s) => s.source)
  const text = useApp((s) => s.text)
  const setText = useApp((s) => s.setText)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const mask = !!studio.source?.mask
  const firstText = useRef(true)

  // Live-update the text source while typing.
  useEffect(() => {
    if (firstText.current) {
      firstText.current = false
      return
    }
    const t = setTimeout(() => void refreshText(), 120)
    return () => clearTimeout(t)
  }, [text])

  const live = source?.live
  return (
    <>
      <Section n="01" title="Import">
        <button type="button" className="dropzone" onClick={pickFile}>
          <I.Upload size={22} />
          <span className="dz-title">Drop, paste or choose a file</span>
          <span className="dz-sub">PNG · JPG · WEBP · GIF · SVG · MP4 · WEBM · project</span>
        </button>
        <div className="row">
          <button type="button" className="btn" onClick={() => void toggleCamera(facing)}>
            {source?.kind === 'camera' ? <I.Freeze /> : <I.Camera />}
            {source?.kind === 'camera' ? 'Freeze frame' : 'Live camera'}
          </button>
          {source?.kind === 'camera' && (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const next = facing === 'user' ? 'environment' : 'user'
                setFacing(next)
                try {
                  await startCamera(next)
                } catch (err) {
                  useApp.getState().toast((err as Error).message, 'error')
                }
              }}
            >
              <I.Flip /> Flip
            </button>
          )}
          {live && source?.kind === 'video' && (
            <button type="button" className="btn" onClick={freezeLive}>
              <I.Freeze /> Freeze frame
            </button>
          )}
        </div>
        {source && (
          <div className="source-card">
            <div>
              <span className="mono-label">{source.kind}</span>
              <strong>{source.name}</strong>
            </div>
            <span className="mono-dim">
              {source.width}×{source.height}
              {live ? ' · live' : ''}
            </span>
          </div>
        )}
        {source?.hasAlpha && source.kind !== 'text' && (
          <Toggle
            label="Shape from transparency"
            hint="Ink follows the alpha channel — ideal for logos and icons"
            checked={mask}
            onChange={(v) => {
              if (studio.source) studio.updateSource({ ...studio.source, mask: v })
              rerender()
            }}
          />
        )}
      </Section>

      <Section n="02" title="Type to ASCII">
        <textarea
          className="textarea"
          rows={2}
          value={text.text}
          placeholder="Write something…"
          onChange={(e) => setText({ text: e.target.value })}
        />
        <Segmented
          size="sm"
          value={text.font}
          onChange={(font) => setText({ font })}
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
            value={text.weight}
            onChange={(weight) => setText({ weight })}
            options={[
              { value: 400, label: 'Regular' },
              { value: 700, label: 'Bold' },
              { value: 900, label: 'Black' },
            ]}
          />
          <Segmented
            size="sm"
            value={text.italic ? 'i' : 'r'}
            onChange={(v) => setText({ italic: v === 'i' })}
            options={[
              { value: 'r', label: 'Roman' },
              { value: 'i', label: <em>Italic</em> },
            ]}
          />
        </div>
        <button
          type="button"
          className="btn wide"
          onClick={async () => {
            await openText()
            useApp.getState().setTab('shape')
          }}
        >
          <I.Text /> {source?.kind === 'text' ? 'Updating live' : 'Use text as source'}
        </button>
      </Section>

      <Section n="03" title="Samples">
        <div className="sample-grid">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="sample"
              onClick={async () => {
                await s.load()
                useApp.getState().setTab('style')
              }}
            >
              <span className={`sample-glyph ${s.id}`}>{SAMPLE_GLYPH[s.id]}</span>
              <span className="sample-name">{s.name}</span>
              <span className="mono-dim">{s.kind}</span>
            </button>
          ))}
        </div>
        <Hint>All samples are generated in your browser. Nothing is uploaded — every conversion runs locally.</Hint>
      </Section>
    </>
  )
}
