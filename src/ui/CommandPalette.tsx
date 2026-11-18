/**
 * ⌘K — every action in one searchable list. Grouped, fuzzy-matched, fully
 * keyboard driven (↑ ↓ to move, ↵ to run, esc to close).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addCameraLayer, pickFiles } from '../app/actions'
import { addPaintLayer, newBlankBoard } from '../app/doc'
import { applyLook } from '../app/looks'
import { startRecording, stopRecording } from '../app/recorder'
import { SAMPLES, addText } from '../app/sources'
import { redo, rememberToolForPick, undo } from '../app/tools'
import { ANIMATIONS } from '../anim/animations'
import { LOOKS } from '../engine/presets'
import { ACCENTS, useApp, type Tab } from '../state/store'
import { TOOLS } from './catalog'
import { Kbd } from './ds'
import { I } from './icons'
import { INTERACTIONS } from './interactions'

interface Cmd {
  id: string
  group: string
  label: string
  icon?: ReactNode
  hint?: ReactNode
  keywords?: string
  current?: boolean
  run: () => void
}

function commands(): Cmd[] {
  const s = useApp.getState()
  const board = !!s.board
  const out: Cmd[] = []
  const add = (c: Cmd) => out.push(c)

  add({ id: 'add-files', group: 'Add', label: 'Add files…', icon: <I.Upload size={16} />, keywords: 'open import image photo video pdf svg eps upload', run: () => pickFiles() })
  add({ id: 'add-camera', group: 'Add', label: 'Add camera', icon: <I.Camera size={16} />, keywords: 'webcam live', run: () => void addCameraLayer() })
  add({ id: 'add-text', group: 'Add', label: 'Add text', icon: <I.Text size={16} />, keywords: 'type words title', run: () => void addText(board ? 'above' : 'top') })
  add({
    id: 'add-paint',
    group: 'Add',
    label: board ? 'Add paint layer' : 'Start drawing',
    icon: <I.Brush size={16} />,
    keywords: 'brush draw blank',
    run: () => {
      if (!board) newBlankBoard(1)
      else {
        addPaintLayer(`Paint ${s.layers.filter((l) => l.kind === 'paint').length + 1}`, 'ink', 'above')
        useApp.getState().setTool('brush')
      }
    },
  })
  for (const smp of SAMPLES) add({ id: `sample-${smp.id}`, group: 'Add', label: `Open sample: ${smp.name}`, icon: '✦', keywords: `example demo ${smp.kind}`, run: () => void smp.load() })

  if (board) {
    for (const t of TOOLS)
      add({
        id: `tool-${t.id}`,
        group: 'Tools',
        label: t.name,
        icon: t.icon,
        hint: <Kbd>{t.key}</Kbd>,
        current: s.tool === t.id,
        keywords: 'tool',
        run: () => {
          rememberToolForPick(useApp.getState().tool)
          useApp.getState().setTool(t.id)
        },
      })
    for (const l of LOOKS) add({ id: `look-${l.id}`, group: 'Looks', label: `Look: ${l.name}`, icon: <i className="cmdk-dot" style={{ background: l.swatch[1], boxShadow: `0 0 0 3px ${l.swatch[0]}` }} />, keywords: 'style preset theme color', run: () => applyLook(l.id) })
    for (const m of (['density', 'contour', 'braille', 'pixels', 'phrase'] as const))
      add({ id: `mode-${m}`, group: 'Shape', label: `Mode: ${m[0].toUpperCase()}${m.slice(1)}`, icon: '▦', current: s.shape.mode === m, keywords: 'shape convert characters', run: () => useApp.getState().setShape({ mode: m }) })
    for (const a of ANIMATIONS)
      add({
        id: `anim-${a.id}`,
        group: 'Motion',
        label: a.id === 'none' ? 'Stop animation' : `Animate: ${a.name}`,
        icon: '∿',
        current: s.motion.animation === a.id,
        keywords: `motion animation ${a.hint}`,
        run: () => useApp.getState().setMotion({ animation: a.id, duration: a.duration, playing: true }),
      })
    if (s.motion.animation !== 'none')
      add({ id: 'play', group: 'Motion', label: s.motion.playing ? 'Pause' : 'Play', icon: s.motion.playing ? <I.Pause size={16} /> : <I.Play size={16} />, hint: <Kbd>Space</Kbd>, run: () => useApp.getState().setMotion({ playing: !s.motion.playing }) })
    for (const m of INTERACTIONS)
      add({
        id: `int-${m.id}`,
        group: 'Interaction',
        label: m.id === 'off' ? 'Interaction off' : `Interact: ${m.name}`,
        icon: '◎',
        current: s.interaction.mode === m.id,
        keywords: `pointer touch ${m.hint}`,
        run: () => {
          useApp.getState().setInteraction({ mode: m.id })
          if (m.id !== 'off') useApp.getState().setTool('interact')
        },
      })
    add({
      id: 'rec',
      group: 'Board',
      label: s.recording ? 'Stop recording' : 'Record the board',
      icon: <i className="rec-dot" />,
      keywords: 'video capture take',
      run: () => (useApp.getState().recording ? void stopRecording() : startRecording(useApp.getState().ui.recPointer)),
    })
    add({ id: 'compare', group: 'Board', label: s.ui.compare ? 'Hide comparison' : 'Compare with the original', icon: <I.Compare size={16} />, run: () => s.setUi({ compare: !s.ui.compare }) })
    add({ id: 'fit', group: 'Board', label: 'Zoom to fit', icon: <I.Fit size={16} />, run: () => s.setUi({ zoom: 'fit' }) })
    add({ id: 'undo', group: 'Board', label: 'Undo', icon: <I.Undo size={16} />, hint: <Kbd>⌘Z</Kbd>, run: undo })
    add({ id: 'redo', group: 'Board', label: 'Redo', icon: <I.Redo size={16} />, hint: <Kbd>⇧⌘Z</Kbd>, run: redo })
    add({ id: 'export', group: 'Board', label: 'Export…', icon: <I.Download size={16} />, hint: <Kbd>⌘E</Kbd>, keywords: 'download save png svg pdf cmyk gif mp4 share', run: () => s.setUi({ exportOpen: true }) })
    for (const [tab, name] of [
      ['layers', 'Layers'],
      ['shape', 'Shape'],
      ['style', 'Style'],
      ['motion', 'Motion'],
    ] as [Tab, string][])
      add({ id: `tab-${tab}`, group: 'Panels', label: `Show ${name}`, icon: <I.Arrow size={16} />, run: () => useApp.getState().setTab(tab) })
  }

  add({ id: 'theme', group: 'Appearance', label: s.ui.theme === 'dark' ? 'Light mode' : 'Dark mode', icon: s.ui.theme === 'dark' ? <I.Sun size={16} /> : <I.Moon size={16} />, keywords: 'theme night', run: () => s.setUi({ theme: s.ui.theme === 'dark' ? 'light' : 'dark' }) })
  for (const a of ACCENTS) add({ id: `accent-${a.id}`, group: 'Appearance', label: `Accent: ${a.name}`, icon: <i className="cmdk-dot" style={{ background: a.color }} />, current: s.ui.accent === a.color, keywords: 'color brand', run: () => s.setUi({ accent: a.color }) })
  add({ id: 'ds', group: 'Appearance', label: 'Open the design system', icon: <I.Grid size={16} />, keywords: 'tokens components style guide', run: () => (location.hash = 'design-system') })
  return out
}

/** Higher is better; -1 = no match. Prefix > word start > substring > in-order letters. */
function score(text: string, q: string): number {
  if (!q) return 0
  const t = text.toLowerCase()
  if (t.startsWith(q)) return 100 - t.length * 0.01
  const words = t.split(/[\s:·]+/)
  if (words.some((w) => w.startsWith(q))) return 80 - t.length * 0.01
  const i = t.indexOf(q)
  if (i >= 0) return 60 - i
  let j = 0
  for (let k = 0; k < t.length && j < q.length; k++) if (t[k] === q[j]) j++
  return j === q.length ? 20 - t.length * 0.01 : -1
}

function highlight(label: string, q: string): ReactNode {
  if (!q) return label
  const i = label.toLowerCase().indexOf(q)
  if (i < 0) return label
  return (
    <>
      {label.slice(0, i)}
      <mark>{label.slice(i, i + q.length)}</mark>
      {label.slice(i + q.length)}
    </>
  )
}

export function CommandPalette() {
  const open = useApp((s) => s.ui.palette)
  const setUi = useApp((s) => s.setUi)
  if (!open) return null
  return <Palette close={() => setUi({ palette: false })} />
}

function Palette({ close }: { close: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const all = useMemo(() => commands(), [])
  const query = q.trim().toLowerCase()

  const results = useMemo(() => {
    if (!query) return all
    return all
      .map((c) => ({ c, s: Math.max(score(c.label, query), score(`${c.group} ${c.keywords ?? ''}`, query) - 30) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.c)
  }, [all, query])

  // Group in first-appearance order (relevance order when searching).
  const groups = useMemo(() => {
    const m = new Map<string, Cmd[]>()
    for (const c of results) m.set(c.group, [...(m.get(c.group) ?? []), c])
    return [...m.entries()]
  }, [results])
  const flat = groups.flatMap(([, cs]) => cs)

  useEffect(() => {
    list.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (c: Cmd | undefined) => {
    if (!c) return
    close()
    c.run()
  }

  return (
    <div className="cmdk-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-input">
          <I.Search />
          <input
            autoFocus
            value={q}
            placeholder="Search actions, looks, motions…"
            aria-label="Search actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={flat[active] ? `cmdk-${flat[active].id}` : undefined}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(flat.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(flat[active])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={list}>
          {flat.length === 0 && <p className="cmdk-empty">Nothing matches “{q}”.</p>}
          {groups.map(([group, cs]) => (
            <div key={group} role="group" aria-label={group}>
              <div className="cmdk-group-label t-label">{group}</div>
              {cs.map((c) => {
                const i = flat.indexOf(c)
                return (
                  <button
                    key={c.id}
                    id={`cmdk-${c.id}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    className={`cmdk-item ${i === active ? 'is-active' : ''}`}
                    onPointerMove={() => i !== active && setActive(i)}
                    onClick={() => run(c)}
                  >
                    <span className="cmdk-icon">{c.icon}</span>
                    <span className="cmdk-label">{highlight(c.label, query)}</span>
                    {c.current && <span className="cmdk-current t-meta">current</span>}
                    {c.hint}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span>
            <Kbd>↵</Kbd> run
          </span>
          <span>
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
