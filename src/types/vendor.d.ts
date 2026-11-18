declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z'
    x?: number
    y?: number
    x1?: number
    y1?: number
    x2?: number
    y2?: number
  }
  export interface Path {
    commands: PathCommand[]
  }
  export interface Glyph {
    index: number
    advanceWidth?: number
    getPath(x: number, y: number, fontSize: number): Path
  }
  export interface Font {
    unitsPerEm: number
    charToGlyph(c: string): Glyph
    charToGlyphIndex(c: string): number
  }
  export function parse(buffer: ArrayBuffer): Font
}

declare module 'gifenc' {
  export interface GifFrameOptions {
    palette?: number[][]
    delay?: number
    repeat?: number
    transparent?: boolean
    transparentIndex?: number
    dispose?: number
  }
  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GifFrameOptions): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
  }
  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): Encoder
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: 'rgb565' | 'rgb444' | 'rgba4444' },
  ): number[][]
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array
}

declare module '*.js?raw' {
  const src: string
  export default src
}
