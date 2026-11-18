/**
 * Glyph geometry shared by the on-screen renderers and the vector exporters.
 *
 * Block elements and braille are drawn geometrically (not from the font) so they
 * tile seamlessly at any line height and export as crisp vector shapes.
 */

export const FONT_FAMILY = 'Atelier Mono'
export const FONT_STACK = `"${FONT_FAMILY}", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
/** Advance width of the bundled monospace font, in em. */
export const FONT_ADVANCE = 0.6
export const FONT_ASCENT = 1.02
export const FONT_DESCENT = 0.3
/** Baseline offset from the vertical center of the line box, in em (y-down). */
export const BASELINE_FROM_CENTER = (FONT_ASCENT - FONT_DESCENT) / 2

export type Rect = [number, number, number, number]

const E = 1 / 8

const BLOCKS: Record<number, Rect[]> = {
  0x2580: [[0, 0, 1, 0.5]],
  0x2581: [[0, 1 - E, 1, 1]],
  0x2582: [[0, 1 - 2 * E, 1, 1]],
  0x2583: [[0, 1 - 3 * E, 1, 1]],
  0x2584: [[0, 0.5, 1, 1]],
  0x2585: [[0, 1 - 5 * E, 1, 1]],
  0x2586: [[0, 1 - 6 * E, 1, 1]],
  0x2587: [[0, 1 - 7 * E, 1, 1]],
  0x2588: [[0, 0, 1, 1]],
  0x2589: [[0, 0, 7 * E, 1]],
  0x258a: [[0, 0, 6 * E, 1]],
  0x258b: [[0, 0, 5 * E, 1]],
  0x258c: [[0, 0, 0.5, 1]],
  0x258d: [[0, 0, 3 * E, 1]],
  0x258e: [[0, 0, 2 * E, 1]],
  0x258f: [[0, 0, E, 1]],
  0x2590: [[0.5, 0, 1, 1]],
  0x2594: [[0, 0, 1, E]],
  0x2595: [[1 - E, 0, 1, 1]],
  0x2596: [[0, 0.5, 0.5, 1]],
  0x2597: [[0.5, 0.5, 1, 1]],
  0x2598: [[0, 0, 0.5, 0.5]],
  0x2599: [
    [0, 0, 0.5, 1],
    [0.5, 0.5, 1, 1],
  ],
  0x259a: [
    [0, 0, 0.5, 0.5],
    [0.5, 0.5, 1, 1],
  ],
  0x259b: [
    [0, 0, 1, 0.5],
    [0, 0.5, 0.5, 1],
  ],
  0x259c: [
    [0, 0, 1, 0.5],
    [0.5, 0.5, 1, 1],
  ],
  0x259d: [[0.5, 0, 1, 0.5]],
  0x259e: [
    [0.5, 0, 1, 0.5],
    [0, 0.5, 0.5, 1],
  ],
  0x259f: [
    [0.5, 0, 1, 1],
    [0, 0.5, 0.5, 1],
  ],
}

export const FULL_BLOCK = 0x2588

export function blockRects(cp: number): Rect[] | null {
  return BLOCKS[cp] ?? null
}

export function isBraille(cp: number): boolean {
  return cp >= 0x2800 && cp <= 0x28ff
}

export function isShade(cp: number): boolean {
  return cp >= 0x2591 && cp <= 0x2593
}

export function isGeometric(cp: number): boolean {
  return cp in BLOCKS || isBraille(cp)
}

// Braille dot bit → (column, row) within the 2×4 cell.
const BRAILLE_POS: [number, number][] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 3],
  [1, 3],
]

/** Bit for the dot at (dx, dy) in a 2×4 braille cell. */
export const BRAILLE_BIT: number[][] = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
]

/** Dot centers in normalized cell coordinates. */
export function brailleDots(cp: number): [number, number][] {
  const bits = cp - 0x2800
  const out: [number, number][] = []
  for (let b = 0; b < 8; b++) {
    if (bits & (1 << b)) {
      const [c, r] = BRAILLE_POS[b]
      out.push([c === 0 ? 0.3 : 0.7, (r + 0.5) / 4])
    }
  }
  return out
}

/** Dot radius for a cell of the given size (same units as the inputs). */
export function brailleRadius(cellW: number, cellH: number): number {
  return Math.min(cellW * 0.4, cellH / 4) * 0.36
}

/** Analytic ink coverage of a geometric glyph (0..1), used for density calibration. */
export function geometricCoverage(cp: number, cellW = 0.6, cellH = 1): number {
  const rects = BLOCKS[cp]
  if (rects) return rects.reduce((s, [x0, y0, x1, y1]) => s + (x1 - x0) * (y1 - y0), 0)
  if (isBraille(cp)) {
    const r = brailleRadius(cellW, cellH)
    return (brailleDots(cp).length * Math.PI * r * r) / (cellW * cellH)
  }
  return 0
}

export function toCodepoints(s: string): number[] {
  const out: number[] = []
  for (const ch of s) out.push(ch.codePointAt(0)!)
  return out
}

export function uniqueCodepoints(s: string): number[] {
  return [...new Set(toCodepoints(s))]
}
