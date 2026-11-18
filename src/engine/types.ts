export type RGB = [number, number, number]

export type ConvertMode = 'density' | 'contour' | 'braille' | 'pixels' | 'phrase'
export type DitherMode = 'none' | 'floyd' | 'atkinson' | 'bayer'
export type ColorMode = 'mono' | 'source' | 'gradient' | 'palette'
export type GradientAxis = 'tone' | 'x' | 'y' | 'radial' | 'diagonal'

export interface ShapeSettings {
  mode: ConvertMode
  columns: number
  charsetId: string
  customCharset: string
  /** Keep the charset order as typed instead of sorting by measured ink density. */
  keepOrder: boolean
  /** Shape matching: choose glyphs by sub-cell structure, not only by brightness. */
  detail: boolean
  dither: DitherMode
  brightness: number
  contrast: number
  gamma: number
  invert: boolean
  edgeThreshold: number
  edgeFill: boolean
  phrase: string
  phraseShading: 'opacity' | 'threshold'
  threshold: number
}

export interface StyleSettings {
  colorMode: ColorMode
  ink: string
  background: string
  transparent: boolean
  gradient: string[]
  gradientAxis: GradientAxis
  paletteId: string
  customPalette: string[]
  saturation: number
  cellTint: number
  fontSize: number
  lineHeight: number
  letterSpacing: number
  weight: 400 | 700
  padding: number
  /** Soft-proof: preview colors as they would print in CMYK. */
  proof: boolean
}

export interface MotionSettings {
  animation: string
  playing: boolean
  speed: number
  intensity: number
  duration: number
  highlight: string
  magnet: boolean
}

/**
 * A converted ASCII image. Colors are stored per cell, row-major.
 * `fg` is RGBA (alpha = glyph opacity), `bg` is optional RGBA cell fill.
 */
export interface AsciiFrame {
  cols: number
  rows: number
  chars: Uint32Array
  fg: Uint8Array
  bg: Uint8Array | null
  /** 0..1 amount of "ink" per cell — used by animations and the shade brush. */
  ink: Float32Array
}

export interface SourceFrame {
  el: CanvasImageSource
  width: number
  height: number
  mirror?: boolean
  /** Use the alpha channel as the shape (ink = alpha). */
  mask?: boolean
}

export function createFrame(cols: number, rows: number, withBg = false): AsciiFrame {
  const n = cols * rows
  return {
    cols,
    rows,
    chars: new Uint32Array(n).fill(32),
    fg: new Uint8Array(n * 4),
    bg: withBg ? new Uint8Array(n * 4) : null,
    ink: new Float32Array(n),
  }
}

export function cloneFrame(f: AsciiFrame): AsciiFrame {
  return {
    cols: f.cols,
    rows: f.rows,
    chars: f.chars.slice(),
    fg: f.fg.slice(),
    bg: f.bg ? f.bg.slice() : null,
    ink: f.ink.slice(),
  }
}

export const BLANK_BRAILLE = 0x2800

export function isBlank(cp: number): boolean {
  return cp === 32 || cp === BLANK_BRAILLE || cp === 0 || cp === 0x3000 || cp === 0xa0
}
