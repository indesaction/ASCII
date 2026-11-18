import { cmykLabel, hexToRgb, rgbToCmyk, type CmykOptions } from '../engine/color'
import { FONT_STACK, BASELINE_FROM_CENTER } from '../engine/glyphs'
import { isBlank } from '../engine/types'
import { escapeXml, hex2, snapshot } from './common'
import { Outliner, loadVectorFont, num, shapeToSvgPath } from './outlines'

export interface SvgOptions {
  /** Convert glyphs to vector outlines (font-independent). */
  outlines: boolean
  background: boolean
  cmyk: CmykOptions
}

export interface SvgResult {
  blob: Blob
  traced: number
}

/** ASCII → SVG. Glyphs are defined once in <defs> and placed with <use>, grouped by color. */
export async function exportSvg(opts: SvgOptions): Promise<SvgResult> {
  const { frame, style, title, cellW, cellH } = snapshot()
  const { cols, rows, chars, fg, bg } = frame
  const pad = style.padding
  const W = (cols + 2 * pad) * cellW
  const H = (rows + 2 * pad) * cellH
  const ox = pad * cellW
  const oy = pad * cellH
  const cx = (x: number) => ox + (x + 0.5) * cellW
  const cy = (y: number) => oy + (y + 0.5) * cellH
  const cmykOf = (r: number, g: number, b: number) => cmykLabel(rgbToCmyk(r, g, b, opts.cmyk))

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(W)}" height="${num(H)}" viewBox="0 0 ${num(W)} ${num(H)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<metadata>Created with ASCII Atelier. ${cols}×${rows} cells. Fill colors are sRGB; each group carries its CMYK equivalent in data-cmyk.</metadata>`,
  )
  if (opts.background && !style.transparent) {
    const [r, g, b] = hexToRgb(style.background)
    parts.push(`<rect width="100%" height="100%" fill="${hex2(r, g, b)}" data-cmyk="${cmykOf(r, g, b)}"/>`)
  }

  // Cell background tiles, merged into horizontal runs.
  if (bg) {
    const groups = new Map<string, string[]>()
    for (let y = 0; y < rows; y++) {
      let x = 0
      while (x < cols) {
        const i = (y * cols + x) * 4
        if (bg[i + 3] === 0) {
          x++
          continue
        }
        let x2 = x + 1
        while (x2 < cols) {
          const j = (y * cols + x2) * 4
          if (bg[j] !== bg[i] || bg[j + 1] !== bg[i + 1] || bg[j + 2] !== bg[i + 2] || bg[j + 3] !== bg[i + 3]) break
          x2++
        }
        const key = `${bg[i]},${bg[i + 1]},${bg[i + 2]},${bg[i + 3]}`
        const rect = `<rect x="${num(ox + x * cellW)}" y="${num(oy + y * cellH)}" width="${num((x2 - x) * cellW)}" height="${num(cellH)}"/>`
        const arr = groups.get(key)
        if (arr) arr.push(rect)
        else groups.set(key, [rect])
        x = x2
      }
    }
    for (const [key, rects] of groups) {
      const [r, g, b, a] = key.split(',').map(Number)
      const op = a < 255 ? ` fill-opacity="${num(a / 255)}"` : ''
      parts.push(`<g fill="${hex2(r, g, b)}"${op} data-cmyk="${cmykOf(r, g, b)}">${rects.join('')}</g>`)
    }
  }

  let traced = 0
  if (opts.outlines) {
    const font = await loadVectorFont(style.weight)
    const outliner = new Outliner(font, style.weight, cellW, cellH, style.fontSize)
    const ids = new Map<number, string>()
    const defs: string[] = []
    const groups = new Map<string, string[]>()
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const cp = chars[i]
        if (isBlank(cp) || fg[i * 4 + 3] === 0) continue
        let id = ids.get(cp)
        if (id === undefined) {
          const shape = outliner.get(cp)
          id = shape.empty ? '' : `g${ids.size}`
          ids.set(cp, id)
          if (id) {
            const rule = shape.evenOdd ? ' fill-rule="evenodd"' : ''
            defs.push(`<path id="${id}"${rule} d="${shapeToSvgPath(shape)}"/>`)
          }
        }
        if (!id) continue
        const o = i * 4
        const key = `${fg[o]},${fg[o + 1]},${fg[o + 2]},${fg[o + 3]}`
        const use = `<use href="#${id}" xlink:href="#${id}" x="${num(cx(x))}" y="${num(cy(y))}"/>`
        const arr = groups.get(key)
        if (arr) arr.push(use)
        else groups.set(key, [use])
      }
    }
    traced = outliner.traced.size
    parts.push(`<defs>${defs.join('')}</defs>`)
    for (const [key, uses] of groups) {
      const [r, g, b, a] = key.split(',').map(Number)
      const op = a < 255 ? ` fill-opacity="${num(a / 255)}"` : ''
      parts.push(`<g fill="${hex2(r, g, b)}"${op} data-cmyk="${cmykOf(r, g, b)}">${uses.join('')}</g>`)
    }
  } else {
    // Live text: every glyph gets an explicit x so alignment never depends on the font.
    const family = FONT_STACK.replace(/"/g, "'")
    parts.push(
      `<style>text{font-family:${family};font-size:${num(style.fontSize)}px;font-weight:${style.weight};white-space:pre;font-variant-ligatures:none}</style>`,
    )
    parts.push(`<g text-anchor="middle">`)
    for (let y = 0; y < rows; y++) {
      const spans: string[] = []
      let x = 0
      while (x < cols) {
        const i = y * cols + x
        if (isBlank(chars[i]) || fg[i * 4 + 3] === 0) {
          x++
          continue
        }
        const o = i * 4
        const xs: string[] = []
        let text = ''
        let x2 = x
        while (x2 < cols) {
          const j = y * cols + x2
          const p = j * 4
          if (isBlank(chars[j]) || fg[p] !== fg[o] || fg[p + 1] !== fg[o + 1] || fg[p + 2] !== fg[o + 2] || fg[p + 3] !== fg[o + 3]) break
          xs.push(num(cx(x2)))
          text += String.fromCodePoint(chars[j])
          x2++
        }
        const op = fg[o + 3] < 255 ? ` fill-opacity="${num(fg[o + 3] / 255)}"` : ''
        spans.push(`<tspan x="${xs.join(' ')}" fill="${hex2(fg[o], fg[o + 1], fg[o + 2])}"${op}>${escapeXml(text)}</tspan>`)
        x = x2
      }
      if (spans.length) parts.push(`<text y="${num(cy(y) + BASELINE_FROM_CENTER * style.fontSize)}">${spans.join('')}</text>`)
    }
    parts.push(`</g>`)
  }
  parts.push('</svg>')
  return { blob: new Blob([parts.join('\n')], { type: 'image/svg+xml' }), traced }
}
