import { create } from 'zustand'
import type { MotionSettings, ShapeSettings, StyleSettings } from '../engine/types'

export type Tab = 'source' | 'shape' | 'style' | 'motion' | 'edit'
export type Tool = 'brush' | 'type' | 'erase' | 'fill' | 'recolor' | 'pick' | 'line' | 'rect' | 'shade' | 'pan'
export type SourceKind = 'image' | 'svg' | 'video' | 'camera' | 'text' | 'sample'

export interface SourceMeta {
  kind: SourceKind
  name: string
  width: number
  height: number
  live: boolean
  hasAlpha: boolean
}

export interface TextSettings {
  text: string
  font: 'display' | 'serif' | 'sans' | 'mono'
  weight: 400 | 700 | 900
  italic: boolean
}

export interface EditorSettings {
  tool: Tool
  char: string
  /** 'keep' paints glyphs only; 'paint' also applies `color`. */
  colorMode: 'keep' | 'paint'
  color: string
  size: number
  shadeDir: 1 | -1
}

export interface UiSettings {
  theme: 'light' | 'dark'
  accent: string
  zoom: number | 'fit'
  compare: boolean
  compareX: number
  exportOpen: boolean
  sheetOpen: boolean
}

export const DEFAULT_SHAPE: ShapeSettings = {
  mode: 'density',
  columns: 110,
  charsetId: 'detailed',
  customCharset: ' .oO@',
  keepOrder: false,
  detail: false,
  dither: 'none',
  brightness: 0,
  contrast: 0.1,
  gamma: 1,
  invert: false,
  edgeThreshold: 0.2,
  edgeFill: true,
  phrase: 'ATELIER·',
  phraseShading: 'opacity',
  threshold: 0.5,
}

export const DEFAULT_STYLE: StyleSettings = {
  colorMode: 'mono',
  ink: '#141414',
  background: '#f2eee6',
  transparent: false,
  gradient: ['#2a0700', '#ff4a1c', '#ffd9a8'],
  gradientAxis: 'tone',
  paletteId: 'riso',
  customPalette: [],
  saturation: 1.2,
  cellTint: 0,
  fontSize: 12,
  lineHeight: 1.05,
  letterSpacing: 0,
  weight: 400,
  padding: 2,
  proof: false,
}

export const DEFAULT_MOTION: MotionSettings = {
  animation: 'none',
  playing: true,
  speed: 1,
  intensity: 0.7,
  duration: 4,
  highlight: '#ff4a1c',
  magnet: false,
}

export const DEFAULT_TEXT: TextSettings = { text: 'Atelier', font: 'display', weight: 400, italic: true }

export const DEFAULT_EDITOR: EditorSettings = {
  tool: 'brush',
  char: '#',
  colorMode: 'keep',
  color: '#ff4a1c',
  size: 1,
  shadeDir: 1,
}

export const ACCENTS = [
  { id: 'vermilion', name: 'Vermilion', color: '#ff4a1c' },
  { id: 'klein', name: 'Klein', color: '#2340ff' },
  { id: 'orchid', name: 'Orchid', color: '#d63aa0' },
  { id: 'acid', name: 'Acid', color: '#b6f000' },
  { id: 'jade', name: 'Jade', color: '#00a37a' },
]

const DEFAULT_UI: UiSettings = {
  theme: typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  accent: ACCENTS[0].color,
  zoom: 'fit',
  compare: false,
  compareX: 0.5,
  exportOpen: false,
  // Mobile control sheet: closed on the empty screen, opens once there is art.
  sheetOpen: false,
}

export interface Toast {
  id: number
  text: string
  tone?: 'info' | 'error' | 'success'
}

export interface AppState {
  tab: Tab
  shape: ShapeSettings
  style: StyleSettings
  motion: MotionSettings
  text: TextSettings
  editor: EditorSettings
  ui: UiSettings
  source: SourceMeta | null
  title: string
  edits: { count: number; canUndo: boolean; canRedo: boolean }
  stats: { cols: number; rows: number; glyphs: number; renderer: string; fps: number }
  toasts: Toast[]
  busy: { label: string; progress: number } | null
  setTab(t: Tab): void
  setShape(p: Partial<ShapeSettings>): void
  setStyle(p: Partial<StyleSettings>): void
  setMotion(p: Partial<MotionSettings>): void
  setText(p: Partial<TextSettings>): void
  setEditor(p: Partial<EditorSettings>): void
  setUi(p: Partial<UiSettings>): void
  toast(text: string, tone?: Toast['tone']): void
  dismiss(id: number): void
}

const STORAGE_KEY = 'ascii-atelier:v1'

interface Persisted {
  shape?: Partial<ShapeSettings>
  style?: Partial<StyleSettings>
  motion?: Partial<MotionSettings>
  text?: Partial<TextSettings>
  editor?: Partial<EditorSettings>
  ui?: Partial<Pick<UiSettings, 'theme' | 'accent'>>
}

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Persisted) : {}
  } catch {
    return {}
  }
}

const saved = loadPersisted()
let toastId = 1

export const useApp = create<AppState>((set, get) => ({
  tab: 'source',
  shape: { ...DEFAULT_SHAPE, ...saved.shape },
  style: { ...DEFAULT_STYLE, ...saved.style },
  motion: { ...DEFAULT_MOTION, ...saved.motion },
  text: { ...DEFAULT_TEXT, ...saved.text },
  editor: { ...DEFAULT_EDITOR, ...saved.editor, tool: saved.editor?.tool === 'pan' ? 'brush' : (saved.editor?.tool ?? 'brush') },
  ui: { ...DEFAULT_UI, ...saved.ui },
  source: null,
  title: 'Untitled',
  edits: { count: 0, canUndo: false, canRedo: false },
  stats: { cols: 0, rows: 0, glyphs: 0, renderer: '', fps: 0 },
  toasts: [],
  busy: null,
  setTab: (tab) => set({ tab }),
  setShape: (p) => set({ shape: { ...get().shape, ...p } }),
  setStyle: (p) => set({ style: { ...get().style, ...p } }),
  setMotion: (p) => set({ motion: { ...get().motion, ...p } }),
  setText: (p) => set({ text: { ...get().text, ...p } }),
  setEditor: (p) => set({ editor: { ...get().editor, ...p } }),
  setUi: (p) => set({ ui: { ...get().ui, ...p } }),
  toast: (text, tone = 'info') => {
    const id = toastId++
    set({ toasts: [...get().toasts, { id, text, tone }] })
    setTimeout(() => get().dismiss(id), tone === 'error' ? 6000 : 3200)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

// Persist settings (debounced).
let saveTimer: ReturnType<typeof setTimeout> | undefined
useApp.subscribe((s) => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: Persisted = {
      shape: s.shape,
      style: s.style,
      motion: s.motion,
      text: s.text,
      editor: s.editor,
      ui: { theme: s.ui.theme, accent: s.ui.accent },
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* storage full or unavailable */
    }
  }, 400)
})
