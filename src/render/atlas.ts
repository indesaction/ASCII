import {
  BASELINE_FROM_CENTER,
  FONT_ADVANCE,
  FONT_STACK,
  blockRects,
  brailleDots,
  brailleRadius,
  isBraille,
  isShade,
} from '../engine/glyphs'
import { isBlank } from '../engine/types'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function fontString(weight: number, px: number): string {
  return `${weight} ${px}px ${FONT_STACK}`
}

/**
 * Draw one glyph centered at (cx, cy). Assumes ctx.font, textAlign='center'
 * and textBaseline='alphabetic' are already set, and fillStyle is the ink.
 */
export function drawGlyph(
  ctx: Ctx2D,
  cp: number,
  str: string,
  cx: number,
  cy: number,
  cellW: number,
  cellH: number,
  fontPx: number,
  seamless = true,
): void {
  if (isBlank(cp)) return
  const rects = blockRects(cp)
  if (rects) {
    const x0 = cx - cellW / 2
    const y0 = cy - cellH / 2
    const e = seamless ? 0.5 : 0
    for (const [a, b, c, d] of rects) {
      const l = x0 + a * cellW - (a === 0 ? e : 0)
      const t = y0 + b * cellH - (b === 0 ? e : 0)
      const r = x0 + c * cellW + (c === 1 ? e : 0)
      const btm = y0 + d * cellH + (d === 1 ? e : 0)
      ctx.fillRect(l, t, r - l, btm - t)
    }
    return
  }
  if (isBraille(cp)) {
    const r = brailleRadius(cellW, cellH)
    const x0 = cx - cellW / 2
    const y0 = cy - cellH / 2
    ctx.beginPath()
    for (const [u, v] of brailleDots(cp)) {
      const px = x0 + u * cellW
      const py = y0 + v * cellH
      ctx.moveTo(px + r, py)
      ctx.arc(px, py, r, 0, Math.PI * 2)
    }
    ctx.fill()
    return
  }
  if (isShade(cp)) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(cx - cellW / 2, cy - cellH / 2, cellW, cellH)
    ctx.clip()
    ctx.fillText(str, cx, cy + BASELINE_FROM_CENTER * fontPx)
    ctx.restore()
    return
  }
  ctx.fillText(str, cx, cy + BASELINE_FROM_CENTER * fontPx)
}

export interface Atlas {
  canvas: HTMLCanvasElement | OffscreenCanvas
  boxW: number
  boxH: number
  perRow: number
  count: number
  width: number
  height: number
  key: string
}

export function atlasKey(fontPx: number, weight: number, cellW: number, cellH: number): string {
  return `${fontPx.toFixed(2)}|${weight}|${cellW.toFixed(2)}|${cellH.toFixed(2)}`
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Render white glyphs into a texture atlas (alpha = coverage). Sizes in device px. */
export function buildAtlas(
  strings: string[],
  codes: number[],
  fontPx: number,
  weight: number,
  cellW: number,
  cellH: number,
  maxSize = 4096,
): Atlas {
  const boxW = Math.ceil(Math.max(cellW, fontPx * FONT_ADVANCE) + fontPx * 0.3 + 4)
  const boxH = Math.ceil(Math.max(cellH, fontPx * 1.32) + 4)
  const count = Math.max(1, codes.length)
  const perRow = Math.max(1, Math.min(count, Math.floor(maxSize / boxW)))
  const rows = Math.ceil(count / perRow)
  const width = perRow * boxW
  const height = Math.min(maxSize, rows * boxH)
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d') as Ctx2D
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#ffffff'
  ctx.font = fontString(weight, fontPx)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  for (let i = 0; i < codes.length; i++) {
    const ox = (i % perRow) * boxW
    const oy = Math.floor(i / perRow) * boxH
    if (oy + boxH > height) break
    drawGlyph(ctx, codes[i], strings[i], ox + boxW / 2, oy + boxH / 2, cellW, cellH, fontPx)
  }
  return { canvas, boxW, boxH, perRow, count: codes.length, width, height, key: atlasKey(fontPx, weight, cellW, cellH) }
}
