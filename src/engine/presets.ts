import type { MotionSettings, ShapeSettings, StyleSettings } from './types'

export interface CharsetPreset {
  id: string
  name: string
  chars: string
}

export const CHARSETS: CharsetPreset[] = [
  { id: 'classic', name: 'Classic', chars: ' .:-=+*#%@' },
  {
    id: 'detailed',
    name: 'Detailed',
    chars: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  },
  { id: 'blocks', name: 'Blocks', chars: ' ░▒▓█' },
  { id: 'dots', name: 'Dots', chars: ' ·∙•◦◎●' },
  { id: 'geometric', name: 'Geometric', chars: ' ▫□▪◇◆■' },
  { id: 'letters', name: 'Letters', chars: 'ilrtcjfxszvnuoeaykhqdpbgmw' },
  { id: 'binary', name: 'Binary', chars: ' 10' },
  { id: 'math', name: 'Math', chars: ' ·-+×÷=≠≈±∑∫√∞' },
  { id: 'matrix', name: 'Matrix', chars: ' :.=*+-<>|ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ012345789Z' },
  { id: 'custom', name: 'Custom', chars: '' },
]

export interface PalettePreset {
  id: string
  name: string
  colors: string[]
}

export const PALETTES: PalettePreset[] = [
  { id: 'cmyk', name: 'Process', colors: ['#231f20', '#00aeef', '#ec008c', '#fff200', '#ffffff'] },
  { id: 'riso', name: 'Riso', colors: ['#1b1b1b', '#0078bf', '#ff48b0', '#ffe800', '#f5f0e6'] },
  { id: 'bauhaus', name: 'Bauhaus', colors: ['#111111', '#1c4e9c', '#d9381e', '#f2c12e', '#efe9dd'] },
  { id: 'gameboy', name: 'Handheld', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { id: 'neon', name: 'Neon', colors: ['#0a0a0a', '#7a00ff', '#ff2e88', '#00f0ff', '#b4ff00'] },
  { id: 'pastel', name: 'Pastel', colors: ['#2b2b2b', '#c5e0f7', '#f7c5cc', '#d8f7c5', '#f7efc5'] },
  { id: 'earth', name: 'Earth', colors: ['#3b2f2a', '#5b6b4e', '#8c5a3c', '#c79a6b', '#e9dcc3'] },
  { id: 'custom', name: 'Extracted', colors: [] },
]

export interface GradientPreset {
  id: string
  name: string
  stops: string[]
}

export const GRADIENTS: GradientPreset[] = [
  { id: 'passion', name: 'Passion', stops: ['#3a0614', '#d6204f', '#ffc2cf'] },
  { id: 'noir', name: 'Noir', stops: ['#151515', '#f4f1ea'] },
  { id: 'klein', name: 'Klein', stops: ['#001b8a', '#2c4bff', '#e9edff'] },
  { id: 'riso', name: 'Riso', stops: ['#ff48b0', '#ffe800'] },
  { id: 'ember', name: 'Ember', stops: ['#2a0700', '#ff4a1c', '#ffd9a8'] },
  { id: 'acid', name: 'Acid', stops: ['#122b00', '#c6ff00'] },
  { id: 'vapor', name: 'Vapor', stops: ['#2d0a4e', '#ff71ce', '#01cdfe'] },
  { id: 'chrome', name: 'Chrome', stops: ['#1d1d1f', '#8e9196', '#ffffff'] },
  { id: 'ocean', name: 'Lagoon', stops: ['#03121f', '#0b6e99', '#a8f0e6'] },
]

export interface LookPreset {
  id: string
  name: string
  swatch: [string, string]
  shape?: Partial<ShapeSettings>
  style?: Partial<StyleSettings>
  motion?: Partial<MotionSettings>
}

export const LOOKS: LookPreset[] = [
  {
    id: 'passion',
    name: 'Passion',
    swatch: ['#16040a', '#ff4d7a'],
    shape: { mode: 'density', charsetId: 'dots', dither: 'none', detail: false },
    style: {
      colorMode: 'gradient',
      background: '#16040a',
      gradient: ['#3a0614', '#d6204f', '#ffc2cf'],
      gradientAxis: 'tone',
      cellTint: 0.1,
    },
    motion: { animation: 'glitter', highlight: '#ffd1dc' },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    swatch: ['#f2eee6', '#141414'],
    shape: { mode: 'density', charsetId: 'detailed', dither: 'none' },
    style: { colorMode: 'mono', background: '#f2eee6', ink: '#141414', cellTint: 0 },
  },
  {
    id: 'neon',
    name: 'Neon',
    swatch: ['#0b0b0c', '#ff4fb8'],
    shape: { mode: 'density', charsetId: 'classic', dither: 'none' },
    style: { colorMode: 'source', background: '#0b0b0c', saturation: 1.5, cellTint: 0.14 },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    swatch: ['#040804', '#39ff6a'],
    shape: { mode: 'density', charsetId: 'matrix', dither: 'none' },
    style: { colorMode: 'mono', background: '#040804', ink: '#39ff6a', cellTint: 0 },
    motion: { animation: 'matrix', highlight: '#c8ffd4' },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    swatch: ['#0d2b9e', '#eef1ff'],
    shape: { mode: 'contour', edgeFill: true, charsetId: 'dots', edgeThreshold: 0.18 },
    style: { colorMode: 'mono', background: '#0d2b9e', ink: '#eef1ff', cellTint: 0 },
  },
  {
    id: 'riso',
    name: 'Riso',
    swatch: ['#f5f0e6', '#ff48b0'],
    shape: { mode: 'density', charsetId: 'blocks', dither: 'atkinson' },
    style: {
      colorMode: 'gradient',
      background: '#f5f0e6',
      gradient: ['#0078bf', '#ff48b0', '#ffe800'],
      gradientAxis: 'tone',
      cellTint: 0,
    },
  },
  {
    id: 'braille',
    name: 'Fine Braille',
    swatch: ['#faf8f4', '#1a1a1a'],
    shape: { mode: 'braille', dither: 'floyd', threshold: 0.5 },
    style: { colorMode: 'mono', background: '#faf8f4', ink: '#1a1a1a', cellTint: 0 },
  },
  {
    id: 'pixel',
    name: 'Pixel',
    swatch: ['#111111', '#ffb000'],
    shape: { mode: 'pixels' },
    style: { colorMode: 'source', background: '#111111', saturation: 1.15 },
  },
  {
    id: 'typo',
    name: 'Typographic',
    swatch: ['#efe9df', '#1b1b1b'],
    shape: { mode: 'phrase', phrase: 'ATELIER·', phraseShading: 'opacity' },
    style: { colorMode: 'mono', background: '#efe9df', ink: '#1b1b1b', cellTint: 0, weight: 700 },
  },
  {
    id: 'chrome',
    name: 'Chrome',
    swatch: ['#0d0d0d', '#c9ccd1'],
    shape: { mode: 'density', charsetId: 'detailed', dither: 'none' },
    style: {
      colorMode: 'gradient',
      background: '#0d0d0d',
      gradient: ['#1d1d1f', '#8e9196', '#ffffff'],
      gradientAxis: 'tone',
      cellTint: 0,
    },
  },
  {
    id: 'vapor',
    name: 'Vapor',
    swatch: ['#12001f', '#01cdfe'],
    shape: { mode: 'density', charsetId: 'geometric', dither: 'bayer' },
    style: {
      colorMode: 'gradient',
      background: '#12001f',
      gradient: ['#ff71ce', '#b967ff', '#01cdfe'],
      gradientAxis: 'diagonal',
      cellTint: 0.08,
    },
  },
]

/** Characters offered in the editor's brush palette. */
export const BRUSH_CHARS = '█▓▒░▀▄▌▐■□▪▫●◦•·:;=+*#%@&$/\\|-_~^<>()[]{}◎◆◇×÷±≈∞'
