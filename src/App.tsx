import { useEffect, useRef, useState, type ReactNode } from 'react'
import { addFiles } from './app/sources'
import { rememberToolForPick, redo, undo } from './app/tools'
import { contrastText } from './engine/color'
import { ACCENTS, useApp, type Tab } from './state/store'
import { Board } from './ui/Board'
import { TOOLS } from './ui/catalog'
import { ExportSheet } from './ui/ExportSheet'
import { I } from './ui/icons'
import { LayersPanel } from './ui/panels/LayersPanel'
import { MotionPanel } from './ui/panels/MotionPanel'
import { ShapePanel } from './ui/panels/ShapePanel'
import { StylePanel } from './ui/panels/StylePanel'

const TABS: { id: Tab; name: string; icon: ReactNode }[] = [
  { id: 'layers', name: 'Layers', icon: <I.Layers /> },
  { id: 'shape', name: 'Shape', icon: <I.Shape /> },
  { id: 'style', name: 'Style', icon: <I.Style /> },
  { id: 'motion', name: 'Motion', icon: <I.Motion /> },
]

function TopBar() {
  const title = useApp((s) => s.title)
  const ui = useApp((s) => s.ui)
  const setUi = useApp((s) => s.setUi)
  const hasArt = useApp((s) => !!s.board)
  return (
    <header className="topbar">
      <div className="brand" aria-label="ASCII Atelier">
        <span className="brand-mono">ASCII</span>
        <span className="brand-serif">Atelier</span>
        <i className="brand-dot" />
      </div>
      {hasArt && (
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
          aria-label={ui.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setUi({ theme: ui.theme === 'dark' ? 'light' : 'dark' })}
        >
          {ui.theme === 'dark' ? <I.Sun /> : <I.Moon />}
        </button>
        <button type="button" className="btn primary" aria-label="Export" disabled={!hasArt} onClick={() => setUi({ exportOpen: true })}>
          <I.Download /> <span className="hide-xs">Export</span>
        </button>
      </div>
    </header>
  )
}

function Tabs({ className }: { className: string }) {
  const tab = useApp((s) => s.tab)
  const setTab = useApp((s) => s.setTab)
  const sheet = useApp((s) => s.ui.sheet)
  const setUi = useApp((s) => s.setUi)
  const mobile = className.includes('tabbar')
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
            if (mobile && tab === t.id) setUi({ sheet: sheet ? 0 : 1 })
            else {
              setTab(t.id)
              if (mobile && !sheet) setUi({ sheet: 1 })
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

/** Drag the handle to resize the mobile sheet between its snap points. */
function SheetHandle() {
  const setUi = useApp((s) => s.setUi)
  const start = useRef<{ y: number; sheet: number } | null>(null)
  return (
    <div
      className="sheet-handle"
      role="slider"
      aria-label="Resize controls"
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuenow={useApp.getState().ui.sheet}
      tabIndex={0}
      onKeyDown={(e) => {
        const s = useApp.getState().ui.sheet
        if (e.key === 'ArrowUp') setUi({ sheet: Math.min(2, s + 1) as 0 | 1 | 2 })
        if (e.key === 'ArrowDown') setUi({ sheet: Math.max(0, s - 1) as 0 | 1 | 2 })
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { y: e.clientY, sheet: useApp.getState().ui.sheet }
      }}
      onPointerUp={(e) => {
        const st = start.current
        start.current = null
        if (!st) return
        const dy = e.clientY - st.y
        if (Math.abs(dy) < 8) setUi({ sheet: st.sheet === 2 ? 1 : 2 })
        else setUi({ sheet: Math.max(0, Math.min(2, st.sheet + (dy < 0 ? 1 : -1))) as 0 | 1 | 2 })
      }}
    />
  )
}

function Panel() {
  const tab = useApp((s) => s.tab)
  return (
    <div className="panel-body" key={tab}>
      {tab === 'layers' && <LayersPanel />}
      {tab === 'shape' && <ShapePanel />}
      {tab === 'style' && <StylePanel />}
      {tab === 'motion' && <MotionPanel />}
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
        <div className={`progress ${busy.progress < 0 ? 'indeterminate' : ''}`}>
          <i style={busy.progress < 0 ? undefined : { width: `${Math.round(busy.progress * 100)}%` }} />
        </div>
        {busy.progress >= 0 && <span className="mono-dim">{Math.round(busy.progress * 100)}%</span>}
      </div>
    </div>
  )
}

function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
}

export default function App() {
  const theme = useApp((s) => s.ui.theme)
  const accent = useApp((s) => s.ui.accent)
  const sheet = useApp((s) => s.ui.sheet)
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

  // Drag & drop + paste add layers
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
      if (e.dataTransfer?.files.length) void addFiles(e.dataTransfer.files)
    }
    const paste = (e: ClipboardEvent) => {
      if (isTyping(e)) return
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) {
        e.preventDefault()
        void addFiles(files)
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
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && k === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && k === 'e') {
        e.preventDefault()
        if (s.board) s.setUi({ exportOpen: true })
        return
      }
      if (mod || e.altKey) return
      if (e.key === ' ' && s.motion.animation !== 'none') {
        e.preventDefault()
        s.setMotion({ playing: !s.motion.playing })
        return
      }
      if (e.key === '[' || e.key === ']') {
        const f = e.key === ']' ? 1.2 : 1 / 1.2
        s.setBrush({ size: Math.round(Math.max(2, Math.min(400, s.brush.size * f))) })
        return
      }
      const tool = TOOLS.find((t) => t.key.toLowerCase() === k)
      if (tool && s.board) {
        rememberToolForPick(s.tool)
        s.setTool(tool.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app sheet-${sheet}`} data-tab={tab}>
      <TopBar />
      <main className="main">
        <Board />
      </main>
      <aside className="panel" aria-label="Controls">
        <SheetHandle />
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
              Drop to add <em>a new layer</em>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
