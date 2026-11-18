import { parse, type Font } from 'opentype.js'
import { fontUrl } from '../app/fonts'
import { BASELINE_FROM_CENTER, FONT_ADVANCE, blockRects, brailleDots, brailleRadius, isBraille } from '../engine/glyphs'
import { isBlank } from '../engine/types'
import { traceGlyph } from './trace'

export type Cmd = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number] | ['C', number, number, number, number, number, number] | ['Z']

/** Glyph geometry relative to the cell center, y-down, in output units. */
export interface Shape {
  cmds: Cmd[]
  evenOdd: boolean
  rects: [number, number, number, number][]
  circles: [number, number, number][]
  empty: boolean
}

const fonts = new Map<number, Promise<Font>>()

export function loadVectorFont(weight: number): Promise<Font> {
  const w = weight >= 600 ? 700 : 400
  let p = fonts.get(w)
  if (!p) {
    p = fetch(fontUrl(w))
      .then((r) => {
        if (!r.ok) throw new Error('Font download failed')
        return r.arrayBuffer()
      })
      .then((buf) => parse(buf))
    fonts.set(w, p)
  }
  return p
}

const EMPTY: Shape = { cmds: [], evenOdd: false, rects: [], circles: [], empty: true }

export class Outliner {
  private cache = new Map<number, Shape>()
  readonly traced = new Set<number>()
  private font: Font
  private weight: number
  private cellW: number
  private cellH: number
  private size: number

  constructor(font: Font, weight: number, cellW: number, cellH: number, fontSize: number) {
    this.font = font
    this.weight = weight
    this.cellW = cellW
    this.cellH = cellH
    this.size = fontSize
  }

  get(cp: number): Shape {
    let s = this.cache.get(cp)
    if (!s) {
      s = this.build(cp)
      this.cache.set(cp, s)
    }
    return s
  }

  private build(cp: number): Shape {
    if (isBlank(cp)) return EMPTY
    const { cellW: cw, cellH: ch } = this
    const rects = blockRects(cp)
    if (rects) {
      return {
        cmds: [],
        evenOdd: false,
        circles: [],
        empty: false,
        rects: rects.map(([a, b, c, d]) => [-cw / 2 + a * cw, -ch / 2 + b * ch, (c - a) * cw, (d - b) * ch]),
      }
    }
    if (isBraille(cp)) {
      const r = brailleRadius(cw, ch)
      return {
        cmds: [],
        evenOdd: false,
        rects: [],
        empty: false,
        circles: brailleDots(cp).map(([u, v]) => [-cw / 2 + u * cw, -ch / 2 + v * ch, r]),
      }
    }
    const str = String.fromCodePoint(cp)
    const size = this.size
    if (this.font.charToGlyphIndex(str) > 0) {
      const path = this.font.charToGlyph(str).getPath((-FONT_ADVANCE * size) / 2, BASELINE_FROM_CENTER * size, size)
      const cmds: Cmd[] = []
      for (const c of path.commands) {
        if (c.type === 'M') cmds.push(['M', c.x!, c.y!])
        else if (c.type === 'L') cmds.push(['L', c.x!, c.y!])
        else if (c.type === 'Q') cmds.push(['Q', c.x1!, c.y1!, c.x!, c.y!])
        else if (c.type === 'C') cmds.push(['C', c.x1!, c.y1!, c.x2!, c.y2!, c.x!, c.y!])
        else cmds.push(['Z'])
      }
      return { cmds, evenOdd: false, rects: [], circles: [], empty: cmds.length === 0 }
    }
    // Not in the bundled font → trace the system-rendered glyph.
    this.traced.add(cp)
    const loops = traceGlyph(str, this.weight)
    const cmds: Cmd[] = []
    for (const loop of loops) {
      loop.forEach(([x, y], i) => cmds.push([i === 0 ? 'M' : 'L', x * size, y * size]))
      cmds.push(['Z'])
    }
    return { cmds, evenOdd: true, rects: [], circles: [], empty: cmds.length === 0 }
  }
}

export const num = (v: number) => {
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

export function shapeToSvgPath(s: Shape): string {
  let d = ''
  for (const c of s.cmds) {
    if (c[0] === 'Z') d += 'Z'
    else d += c[0] + c.slice(1).map((v) => num(v as number)).join(' ')
  }
  for (const [x, y, w, h] of s.rects) d += `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}Z`
  for (const [cx, cy, r] of s.circles) {
    d += `M${num(cx - r)} ${num(cy)}a${num(r)} ${num(r)} 0 1 0 ${num(2 * r)} 0a${num(r)} ${num(r)} 0 1 0 ${num(-2 * r)} 0Z`
  }
  return d
}

const K = 0.5522847498

/** PDF path operators (y flipped to PDF's y-up space) followed by a fill operator. */
export function shapeToPdfOps(s: Shape): string {
  const out: string[] = []
  let cx = 0
  let cy = 0
  for (const c of s.cmds) {
    switch (c[0]) {
      case 'M':
        out.push(`${num(c[1])} ${num(-c[2])} m`)
        cx = c[1]
        cy = c[2]
        break
      case 'L':
        out.push(`${num(c[1])} ${num(-c[2])} l`)
        cx = c[1]
        cy = c[2]
        break
      case 'Q': {
        const [, qx, qy, x, y] = c
        const c1x = cx + (2 / 3) * (qx - cx)
        const c1y = cy + (2 / 3) * (qy - cy)
        const c2x = x + (2 / 3) * (qx - x)
        const c2y = y + (2 / 3) * (qy - y)
        out.push(`${num(c1x)} ${num(-c1y)} ${num(c2x)} ${num(-c2y)} ${num(x)} ${num(-y)} c`)
        cx = x
        cy = y
        break
      }
      case 'C':
        out.push(`${num(c[1])} ${num(-c[2])} ${num(c[3])} ${num(-c[4])} ${num(c[5])} ${num(-c[6])} c`)
        cx = c[5]
        cy = c[6]
        break
      case 'Z':
        out.push('h')
        break
    }
  }
  for (const [x, y, w, h] of s.rects) out.push(`${num(x)} ${num(-(y + h))} ${num(w)} ${num(h)} re`)
  for (const [x, y, r] of s.circles) {
    const Y = -y
    const k = r * K
    out.push(
      `${num(x + r)} ${num(Y)} m`,
      `${num(x + r)} ${num(Y + k)} ${num(x + k)} ${num(Y + r)} ${num(x)} ${num(Y + r)} c`,
      `${num(x - k)} ${num(Y + r)} ${num(x - r)} ${num(Y + k)} ${num(x - r)} ${num(Y)} c`,
      `${num(x - r)} ${num(Y - k)} ${num(x - k)} ${num(Y - r)} ${num(x)} ${num(Y - r)} c`,
      `${num(x + k)} ${num(Y - r)} ${num(x + r)} ${num(Y - k)} ${num(x + r)} ${num(Y)} c`,
      'h',
    )
  }
  if (out.length === 0) return ''
  out.push(s.evenOdd ? 'f*' : 'f')
  return out.join('\n')
}
