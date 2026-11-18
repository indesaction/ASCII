import { useEffect, useRef, useState, type ReactNode } from 'react'
import { addFiles } from './app/sources'
import { rememberToolForPick, redo, undo } from './app/tools'
import { contrastText } from './engine/color'
import { ACCENTS, useApp, type Tab } from './state/store'
import { Board } from './ui/Board'
import { TOOLS } from './ui/catalog'
import { CommandPalette } from './ui/CommandPalette'
import { DesignSystemPage } from './ui/DesignSystemPage'
import { Button, IconButton, Kbd, Popover } from './ui/ds'
import { ExportSheet } from './ui/ExportSheet'
import { I } from './ui/icons'
import { LayerInspector, LayerStack, LayersPanel } from './ui/panels/LayersPanel'
import { MotionPanel } from './ui/panels/MotionPanel'
import { ShapePanel } from './ui/panels/ShapePanel'
import { StylePanel } from './ui/panels/StylePanel'
import { useMedia } from './ui/useMedia'
import { OptionsBar, RecButton, StatusBar, TakeDialog, ToolRail } from './ui/Workspace'

const WIDE = '(min-width: 1180px)'
const COMPACT = '(max-width: 860px)'

function tabsFor(wide: boolean): { id: Tab; name: string; icon: ReactNode }[] {
  return [
    { id: 'layers', name: wide ? 'Layer' : 'Layers', icon: <I.Layers /> },
    { id: 'shape', name: 'Shape', icon: <I.Shape /> },
    { id: 'style', name: 'Style', icon: <I.Style /> },
    { id: 'motion', name: 'Motion', icon: <I.Motion /> },
  ]
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

// ---------------------------------------------------------------------------
// top bar
// ---------------------------------------------------------------------------

function Appearance() {
  const ui = useApp((s) => s.ui)
  const setUi = useApp((s) => s.setUi)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  return (
    <>
      <IconButton label="Appearance" icon={<I.Palette />} aria-expanded={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())} />
      {anchor && (
        <Popover anchor={anchor} label="Appearance" onClose={() => setAnchor(null)}>
          <span className="t-label">Appearance</span>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {(['light', 'dark'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={ui.theme === t} className={ui.theme === t ? 'is-on' : ''} onClick={() => setUi({ theme: t })}>
                {t === 'light' ? 'Paper' : 'Night'}
              </button>
            ))}
          </div>
          <div className="field">
            <span className="field-label">Accent</span>
            <div className="accents" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={ui.accent === a.color} aria-label={a.name} title={a.name} className={ui.accent === a.color ? 'is-on' : ''} style={{ background: a.color }} onClick={() => setUi({ accent: a.color })} />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="link"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              setAnchor(null)
              location.hash = 'design-system'
            }}
          >
            Open the design system
          </button>
        </Popover>
      )}
    </>
  )
}

function TopBar() {
  const title = useApp((s) => s.title)
  const setUi = useApp((s) => s.setUi)
  const board = useApp((s) => s.board)
  const layers = useApp((s) => s.layers.length)
  const compact = useMedia(COMPACT)
  const hasArt = !!board
  return (
    <header className="topbar">
      <div className="brand" aria-label="ASCII Atelier">
        <span className="brand-mono">ASCII</span>
        <span className="brand-serif">Atelier</span>
        <i className="brand-dot" />
      </div>
      {hasArt && (
        <div className="doc">
          <input className="title-input" value={title} aria-label="Title" spellCheck={false} onChange={(e) => useApp.setState({ title: e.target.value })} />
          <span className="doc-meta t-meta">
            {board.width} × {board.height} px · {layers} {layers === 1 ? 'layer' : 'layers'}
          </span>
        </div>
      )}
      <div className="top-actions">
        {compact ? (
          <IconButton label="Search actions" icon={<I.Search />} onClick={() => setUi({ palette: true })} />
        ) : (
          <Button variant="ghost" className="cmdk-btn" icon={<I.Search size={16} />} onClick={() => setUi({ palette: true })}>
            <span style={{ flex: 1, textAlign: 'left' }}>Search actions</span>
            <Kbd>{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
          </Button>
        )}
        <Appearance />
        {hasArt && (
          <>
            <span className="top-divider" />
            <RecButton compact={compact} />
            <Button variant="primary" className={compact ? 'btn--icon' : ''} icon={<I.Download />} aria-label="Export" onClick={() => setUi({ exportOpen: true })}>
              {!compact && 'Export'}
            </Button>
          </>
        )}
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// panels
// ---------------------------------------------------------------------------

function Tabs({ className, wide }: { className: string; wide: boolean }) {
  const tab = useApp((s) => s.tab)
  const setTab = useApp((s) => s.setTab)
  const sheet = useApp((s) => s.ui.sheet)
  const setUi = useApp((s) => s.setUi)
  const mobile = className.includes('tabbar')
  return (
    <nav className={className} role="tablist" aria-label="Panels">
      {tabsFor(wide).map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={tab === t.id ? 'is-on' : ''}
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
  const sheet = useApp((s) => s.ui.sheet)
  const start = useRef<{ y: number; sheet: number } | null>(null)
  return (
    <div
      className="sheet-handle"
      role="slider"
      aria-label="Resize controls"
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuenow={sheet}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') setUi({ sheet: Math.min(2, sheet + 1) as 0 | 1 | 2 })
        if (e.key === 'ArrowDown') setUi({ sheet: Math.max(0, sheet - 1) as 0 | 1 | 2 })
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { y: e.clientY, sheet }
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

function Inspector({ wide }: { wide: boolean }) {
  const tab = useApp((s) => s.tab)
  return (
    <aside className="inspector" aria-label="Inspector">
      <SheetHandle />
      <Tabs className="tabs" wide={wide} />
      <div className="panel-body" key={tab} role="tabpanel">
        {tab === 'layers' && (wide ? <LayerInspector /> : <LayersPanel />)}
        {tab === 'shape' && <ShapePanel />}
        {tab === 'style' && <StylePanel />}
        {tab === 'motion' && <MotionPanel />}
      </div>
    </aside>
  )
}

function Sidebar() {
  const count = useApp((s) => s.layers.length + 1)
  return (
    <aside className="sidebar" aria-label="Layers">
      <div className="panel-head">
        <span className="t-label">Layers</span>
        <span className="t-meta">{count}</span>
      </div>
      <div className="panel-body">
        <LayerStack heading={false} />
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// feedback
// ---------------------------------------------------------------------------

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
        {busy.progress >= 0 && <span className="t-meta">{Math.round(busy.progress * 100)}%</span>}
      </div>
    </div>
  )
}

function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
}

function useHash(): string {
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

// ---------------------------------------------------------------------------
// app
// ---------------------------------------------------------------------------

export default function App() {
  const theme = useApp((s) => s.ui.theme)
  const accent = useApp((s) => s.ui.accent)
  const sheet = useApp((s) => s.ui.sheet)
  const hasArt = useApp((s) => !!s.board)
  const tab = useApp((s) => s.tab)
  const wide = useMedia(WIDE)
  const hash = useHash()
  const [dragging, setDragging] = useState(false)

  // Theme + accent
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.setProperty('--color-accent', accent)
    root.style.setProperty('--color-accent-ink', contrastText(accent))
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f0e0d' : '#f4f1eb')
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
      const mod = e.metaKey || e.ctrlKey
      const s = useApp.getState()
      const k = e.key.toLowerCase()
      if (mod && k === 'k') {
        e.preventDefault()
        s.setUi({ palette: !s.ui.palette })
        return
      }
      if (isTyping(e) || s.ui.palette) return
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

  if (hash === '#design-system')
    return (
      <>
        <DesignSystemPage />
        <Toasts />
      </>
    )

  return (
    <div className={`app ${hasArt ? 'has-art' : 'is-empty'} sheet-${sheet}`} data-tab={tab}>
      <TopBar />
      {hasArt && wide && <Sidebar />}
      {hasArt && <ToolRail />}
      {hasArt && <OptionsBar />}
      <main className="canvas-area">
        <Board />
      </main>
      {hasArt && <StatusBar />}
      {hasArt && <Inspector wide={wide} />}
      {hasArt && <Tabs className="tabbar" wide={false} />}
      <ExportSheet />
      <TakeDialog />
      <CommandPalette />
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
