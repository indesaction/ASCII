import { create } from 'zustand'
import type { InteractionSettings, MotionSettings, ShapeSettings, StyleSettings } from '../engine/types'

export type Tab = 'layers' | 'shape' | 'style' | 'motion'
export type Tool = 'interact' | 'move' | 'brush' | 'eraser' | 'glyph' | 'text' | 'pick' | 'hand'
export type LayerKind = 'image' | 'video' | 'camera' | 'text' | 'paint' | 'gif' | 'pdf'
export type BlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference' | 'lighter'

export interface TextSettings {
  text: string
  font: 'display' | 'serif' | 'sans' | 'mono'
  weight: 400 | 700 | 900
  italic: boolean
  /** 'ink' renders at full ink density (always legible); otherwise the text keeps `color`. */
  fill: 'ink' | 'color'
  color: string
}

/** Serializable description of a layer. Pixels live in the studio's layer runtimes. */
export interface LayerMeta {
  id: string
  name: string
  kind: LayerKind
  visible: boolean
  opacity: number
  blend: BlendMode
  /** Center of the layer on the board, in board pixels. */
  x: number
  y: number
  scale: number
  rotation: number
  /** Natural size of the layer's pixels. */
  width: number
  height: number
  /** Paint layers drawn with "Ink" follow the background (dark ink on light, light on dark). */
  tint?: 'ink' | 'none'
  hasMask?: boolean
  text?: TextSettings
  page?: number
  pages?: number
  playing?: boolean
  loop?: boolean
  rate?: number
}

export interface Board {
  width: number
  height: number
}

export interface BrushSettings {
  size: number
  hardness: number
  flow: number
  color: string
  /** Paint with the adaptive ink color instead of `color`. */
  ink: boolean
  pressure: boolean
  smoothing: number
}

export interface GlyphSettings {
  char: string
  size: number
  colorMode: 'keep' | 'paint'
  color: string
}

export interface UiSettings {
  theme: 'light' | 'dark'
  accent: string
  zoom: number | 'fit'
  compare: boolean
  compareX: number
  exportOpen: boolean
  /** Mobile control sheet height: 0 hidden, 1 half, 2 tall. */
  sheet: 0 | 1 | 2
  /** Draw touch points into recordings. */
  recPointer: boolean
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
  alphaInk: false,
}

export const DEFAULT_STYLE: StyleSettings = {
  colorMode: 'mono',
  ink: '#141414',
  background: '#f2eee6',
  transparent: false,
  gradient: ['#3a0614', '#d6204f', '#ffc2cf'],
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
  highlight: '#d6204f',
}

export const DEFAULT_INTERACTION: InteractionSettings = { mode: 'repel', strength: 0.6, radius: 10 }

export const DEFAULT_TEXT: TextSettings = {
  text: 'Atelier',
  font: 'display',
  weight: 400,
  italic: true,
  fill: 'ink',
  color: '#d6204f',
}

export const DEFAULT_BRUSH: BrushSettings = {
  size: 60,
  hardness: 0.35,
  flow: 0.7,
  color: '#d6204f',
  ink: true,
  pressure: true,
  smoothing: 0.45,
}

export const DEFAULT_GLYPH: GlyphSettings = { char: '✦', size: 1, colorMode: 'paint', color: '#d6204f' }

export const ACCENTS = [
  { id: 'rouge', name: 'Rouge', color: '#d6204f' },
  { id: 'vermilion', name: 'Vermilion', color: '#ff4a1c' },
  { id: 'klein', name: 'Klein', color: '#2340ff' },
  { id: 'orchid', name: 'Orchid', color: '#b5179e' },
  { id: 'jade', name: 'Jade', color: '#00a37a' },
]

function initialTheme(): 'light' | 'dark' {
  if (typeof document !== 'undefined') {
    const t = document.documentElement.getAttribute('data-theme')
    if (t === 'light' || t === 'dark') return t
  }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const DEFAULT_UI: UiSettings = {
  theme: initialTheme(),
  accent: ACCENTS[0].color,
  zoom: 'fit',
  compare: false,
  compareX: 0.5,
  exportOpen: false,
  sheet: 0,
  recPointer: true,
}

export interface Toast {
  id: number
  text: string
  tone?: 'info' | 'error' | 'success'
}

export interface Take {
  url: string
  blob: Blob
  ext: string
  seconds: number
}

export interface AppState {
  tab: Tab
  tool: Tool
  shape: ShapeSettings
  style: StyleSettings
  motion: MotionSettings
  interaction: InteractionSettings
  text: TextSettings
  brush: BrushSettings
  glyph: GlyphSettings
  ui: UiSettings
  board: Board | null
  layers: LayerMeta[]
  activeLayer: string | null
  glyphLayer: { visible: boolean; count: number }
  history: { canUndo: boolean; canRedo: boolean }
  recording: { startedAt: number } | null
  take: Take | null
  title: string
  stats: { cols: number; rows: number; glyphs: number; renderer: string; fps: number }
  toasts: Toast[]
  busy: { label: string; progress: number } | null
  setTab(t: Tab): void
  setTool(t: Tool): void
  setShape(p: Partial<ShapeSettings>): void
  setStyle(p: Partial<StyleSettings>): void
  setMotion(p: Partial<MotionSettings>): void
  setInteraction(p: Partial<InteractionSettings>): void
  setText(p: Partial<TextSettings>): void
  setBrush(p: Partial<BrushSettings>): void
  setGlyph(p: Partial<GlyphSettings>): void
  setUi(p: Partial<UiSettings>): void
  toast(text: string, tone?: Toast['tone']): void
  dismiss(id: number): void
}

const STORAGE_KEY = 'ascii-atelier:v1'

interface Persisted {
  shape?: Partial<ShapeSettings>
  style?: Partial<StyleSettings>
  motion?: Partial<MotionSettings>
  interaction?: Partial<InteractionSettings>
  text?: Partial<TextSettings>
  brush?: Partial<BrushSettings>
  glyph?: Partial<GlyphSettings>
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
  tab: 'layers',
  tool: 'interact',
  shape: { ...DEFAULT_SHAPE, ...saved.shape },
  style: { ...DEFAULT_STYLE, ...saved.style },
  motion: { ...DEFAULT_MOTION, ...saved.motion },
  interaction: { ...DEFAULT_INTERACTION, ...saved.interaction },
  text: { ...DEFAULT_TEXT, ...saved.text },
  brush: { ...DEFAULT_BRUSH, ...saved.brush },
  glyph: { ...DEFAULT_GLYPH, ...saved.glyph },
  ui: { ...DEFAULT_UI, ...saved.ui },
  board: null,
  layers: [],
  activeLayer: null,
  glyphLayer: { visible: true, count: 0 },
  history: { canUndo: false, canRedo: false },
  recording: null,
  take: null,
  title: 'Untitled',
  stats: { cols: 0, rows: 0, glyphs: 0, renderer: '', fps: 0 },
  toasts: [],
  busy: null,
  setTab: (tab) => set({ tab }),
  setTool: (tool) => set({ tool }),
  setShape: (p) => set({ shape: { ...get().shape, ...p } }),
  setStyle: (p) => set({ style: { ...get().style, ...p } }),
  setMotion: (p) => set({ motion: { ...get().motion, ...p } }),
  setInteraction: (p) => set({ interaction: { ...get().interaction, ...p } }),
  setText: (p) => set({ text: { ...get().text, ...p } }),
  setBrush: (p) => set({ brush: { ...get().brush, ...p } }),
  setGlyph: (p) => set({ glyph: { ...get().glyph, ...p } }),
  setUi: (p) => set({ ui: { ...get().ui, ...p } }),
  toast: (text, tone = 'info') => {
    const id = toastId++
    set({ toasts: [...get().toasts.slice(-2), { id, text, tone }] })
    setTimeout(() => get().dismiss(id), tone === 'error' ? 6000 : 3200)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

// Persist settings (debounced).
let saveTimer: ReturnType<typeof setTimeout> | undefined
useApp.subscribe((s, prev) => {
  if (
    s.shape === prev.shape &&
    s.style === prev.style &&
    s.motion === prev.motion &&
    s.interaction === prev.interaction &&
    s.text === prev.text &&
    s.brush === prev.brush &&
    s.glyph === prev.glyph &&
    s.ui === prev.ui
  )
    return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: Persisted = {
      shape: s.shape,
      style: s.style,
      motion: s.motion,
      interaction: s.interaction,
      text: s.text,
      brush: s.brush,
      glyph: s.glyph,
      ui: { theme: s.ui.theme, accent: s.ui.accent },
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* storage full or unavailable */
    }
  }, 400)
})
