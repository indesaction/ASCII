import { useEffect, useState, type ReactNode } from 'react'
import { redo, undo } from './app/editor'
import { openFile } from './app/sources'
import { ACCENTS, useApp, type Tab } from './state/store'
import { contrastText } from './engine/color'
import { ExportSheet } from './ui/ExportSheet'
import { I } from './ui/icons'
import { EditPanel } from './ui/panels/EditPanel'
import { TOOLS } from './ui/tools'
import { MotionPanel } from './ui/panels/MotionPanel'
import { ShapePanel } from './ui/panels/ShapePanel'
import { SourcePanel } from './ui/panels/SourcePanel'
import { StylePanel } from './ui/panels/StylePanel'
import { Stage } from './ui/Stage'

const TABS: { id: Tab; name: string; icon: ReactNode }[] = [
  { id: 'source', name: 'Source', icon: <I.Source /> },
  { id: 'shape', name: 'Shape', icon: <I.Shape /> },
  { id: 'style', name: 'Style', icon: <I.Style /> },
  { id: 'motion', name: 'Motion', icon: <I.Motion /> },
  { id: 'edit', name: 'Edit', icon: <I.Edit /> },
]

function TopBar() {
  const title = useApp((s) => s.title)
  const ui = useApp((s) => s.ui)
  const setUi = useApp((s) => s.setUi)
  const hasSource = useApp((s) => !!s.source)
  return (
    <header className="topbar">
      <div className="brand" aria-label="ASCII Atelier">
        <span className="brand-mono">ASCII</span>
        <span className="brand-serif">Atelier</span>
        <i className="brand-dot" />
      </div>
      {hasSource && (
        <input
          className="title-input"
          value={title}
          aria-label="Title"
          spellCheck={false}
          onChange={(e) => useApp.setState({ title: e.target.value })}
        />
      )}
      <div className="top-actions">
        <div className="accents" role="radiogroup" aria-label="Accent color">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={ui.accent === a.color}
              aria-label={a.name}
              title={a.name}
              className={ui.accent === a.color ? 'on' : ''}
              style={{ background: a.color }}
              onClick={() => setUi({ accent: a.color })}
            />
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Toggle dark mode"
          onClick={() => setUi({ theme: ui.theme === 'dark' ? 'light' : 'dark' })}
        >
          {ui.theme === 'dark' ? <I.Sun /> : <I.Moon />}
        </button>
        <button type="button" className="btn primary" aria-label="Export" disabled={!hasSource} onClick={() => setUi({ exportOpen: true })}>
          <I.Download /> <span className="hide-xs">Export</span>
        </button>
      </div>
    </header>
  )
}

function Tabs({ className }: { className: string }) {
  const tab = useApp((s) => s.tab)
  const setTab = useApp((s) => s.setTab)
  const sheetOpen = useApp((s) => s.ui.sheetOpen)
  const setUi = useApp((s) => s.setUi)
  return (
    <nav className={className} role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={tab === t.id ? 'on' : ''}
          onClick={() => {
            if (tab === t.id && className.includes('tabbar')) setUi({ sheetOpen: !sheetOpen })
            else {
              setTab(t.id)
              setUi({ sheetOpen: true })
            }
          }}
        >
          {t.icon}
          <span>{t.name}</span>
        </button>
      ))}
    </nav>
  )
}

function Panel() {
  const tab = useApp((s) => s.tab)
  return (
    <div className="panel-body" key={tab}>
      {tab === 'source' && <SourcePanel />}
      {tab === 'shape' && <ShapePanel />}
      {tab === 'style' && <StylePanel />}
      {tab === 'motion' && <MotionPanel />}
      {tab === 'edit' && <EditPanel />}
    </div>
  )
}

function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismiss)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={`toast ${t.tone ?? ''}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  )
}

function Busy() {
  const busy = useApp((s) => s.busy)
  if (!busy) return null
  return (
    <div className="busy" role="status">
      <div className="busy-card">
        <span className="busy-label">{busy.label}</span>
        <div className="progress">
          <i style={{ width: `${Math.round(busy.progress * 100)}%` }} />
        </div>
        <span className="mono-dim">{Math.round(busy.progress * 100)}%</span>
      </div>
    </div>
  )
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
}

export default function App() {
  const theme = useApp((s) => s.ui.theme)
  const accent = useApp((s) => s.ui.accent)
  const sheetOpen = useApp((s) => s.ui.sheetOpen)
  const tab = useApp((s) => s.tab)
  const [dragging, setDragging] = useState(false)

  // Theme + accent
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-ink', contrastText(accent))
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f0f0e' : '#f3f0ea')
  }, [theme, accent])

  // Drag & drop + paste anywhere
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const f = e.dataTransfer?.files[0]
      if (f) void openFile(f)
    }
    const paste = (e: ClipboardEvent) => {
      if (isTyping(e as unknown as KeyboardEvent)) return
      const f = [...(e.clipboardData?.files ?? [])][0]
      if (f) {
        e.preventDefault()
        void openFile(f)
      }
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('paste', paste)
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const mod = e.metaKey || e.ctrlKey
      const s = useApp.getState()
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        if (s.source) s.setUi({ exportOpen: true })
        return
      }
      if (mod || e.altKey) return
      if (e.key === ' ' && s.motion.animation !== 'none') {
        e.preventDefault()
        s.setMotion({ playing: !s.motion.playing })
        return
      }
      if (s.tab === 'edit') {
        const tool = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase())
        if (tool) s.setEditor({ tool: tool.id })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app ${sheetOpen ? 'sheet-open' : 'sheet-closed'}`} data-tab={tab}>
      <TopBar />
      <main className="main">
        <Stage />
      </main>
      <aside className="panel" aria-label="Controls">
        <Tabs className="tabs" />
        <Panel />
      </aside>
      <Tabs className="tabbar" />
      <ExportSheet />
      <Toasts />
      <Busy />
      {dragging && (
        <div className="drop-overlay">
          <div>
            <I.Upload size={32} />
            <p>
              Drop to <em>set in type</em>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
