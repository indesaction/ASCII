import { hexToRgb, rgbToCmyk } from '../engine/color'
import { isBlank } from '../engine/types'
import { snapshot } from './common'
import { Outliner, loadVectorFont, num, shapeToPdfOps } from './outlines'
import { PAGE_SIZES, type PdfOptions } from './pdfOptions'
import { PdfDoc, pdfDate, pdfString } from './pdfWriter'

const MM = 72 / 25.4

export interface PdfResult {
  blob: Blob
  traced: number
  pageMm: [number, number]
}

/** Vector PDF with all colors in DeviceCMYK. Glyphs are Form XObjects reused across cells. */
export async function exportPdf(opts: PdfOptions): Promise<PdfResult> {
  const { frame, style, title, cellW, cellH } = snapshot()
  const { cols, rows, chars, fg, bg } = frame
  const pad = style.padding
  const artW = (cols + 2 * pad) * cellW
  const artH = (rows + 2 * pad) * cellH
  const margin = opts.marginMm * MM
  const bleed = opts.bleedMm * MM

  let trimW: number
  let trimH: number
  if (opts.page === 'Fit') {
    trimW = artW * 0.75 + 2 * margin
    trimH = artH * 0.75 + 2 * margin
  } else {
    const [a, b] = PAGE_SIZES[opts.page]
    const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && artW > artH)
    trimW = (landscape ? Math.max(a, b) : Math.min(a, b)) * MM
    trimH = (landscape ? Math.min(a, b) : Math.max(a, b)) * MM
  }
  const ext = bleed + (opts.cropMarks ? 9 * MM : 0)
  const mediaW = trimW + 2 * ext
  const mediaH = trimH + 2 * ext
  const tx = ext
  const ty = ext
  const s = Math.max(0.0001, Math.min((trimW - 2 * margin) / artW, (trimH - 2 * margin) / artH))
  const ax = tx + (trimW - artW * s) / 2
  const ay = ty + (trimH - artH * s) / 2
  const cw = cellW * s
  const ch = cellH * s
  const cellX = (x: number) => ax + (pad + x) * cw
  const cellTop = (y: number) => ay + artH * s - (pad + y) * ch

  const paperRgb: [number, number, number] = [255, 255, 255]
  const bgRgb = hexToRgb(style.background)
  const paintBg = opts.background !== 'none' && !style.transparent
  const under = paintBg ? bgRgb : paperRgb
  const kOp = (r: number, g: number, b: number) => {
    const [c, m, y, k] = rgbToCmyk(r, g, b, opts.cmyk)
    return `${num4(c)} ${num4(m)} ${num4(y)} ${num4(k)} k`
  }

  const out: string[] = []
  // Background
  if (paintBg) {
    out.push(kOp(bgRgb[0], bgRgb[1], bgRgb[2]))
    if (opts.background === 'bleed') out.push(`${num(tx - bleed)} ${num(ty - bleed)} ${num(trimW + 2 * bleed)} ${num(trimH + 2 * bleed)} re f`)
    else out.push(`${num(ax)} ${num(ay)} ${num(artW * s)} ${num(artH * s)} re f`)
  }

  // Cell tiles (blended over the background/paper, merged into horizontal runs)
  const tileColor = new Map<number, [number, number, number]>()
  if (bg) {
    const groups = new Map<string, string[]>()
    for (let y = 0; y < rows; y++) {
      let x = 0
      while (x < cols) {
        const i = y * cols + x
        const o = i * 4
        if (bg[o + 3] === 0) {
          x++
          continue
        }
        const a = bg[o + 3] / 255
        const rgb: [number, number, number] = [
          Math.round(under[0] + (bg[o] - under[0]) * a),
          Math.round(under[1] + (bg[o + 1] - under[1]) * a),
          Math.round(under[2] + (bg[o + 2] - under[2]) * a),
        ]
        tileColor.set(i, rgb)
        let x2 = x + 1
        while (x2 < cols) {
          const p = (y * cols + x2) * 4
          if (bg[p] !== bg[o] || bg[p + 1] !== bg[o + 1] || bg[p + 2] !== bg[o + 2] || bg[p + 3] !== bg[o + 3]) break
          tileColor.set(y * cols + x2, rgb)
          x2++
        }
        const key = kOp(rgb[0], rgb[1], rgb[2])
        // Slight overlap hides hairline seams in some viewers.
        const rect = `${num(cellX(x))} ${num(cellTop(y) - ch - 0.05)} ${num((x2 - x) * cw)} ${num(ch + 0.1)} re`
        const arr = groups.get(key)
        if (arr) arr.push(rect)
        else groups.set(key, [rect])
        x = x2
      }
    }
    for (const [op, rects] of groups) out.push(op, rects.join('\n'), 'f')
  }

  // Glyphs
  const doc = new PdfDoc()
  const catalog = doc.alloc()
  const pages = doc.alloc()
  const page = doc.alloc()
  const content = doc.alloc()
  const fontObj = doc.alloc()
  const info = doc.alloc()

  const font = await loadVectorFont(style.weight)
  const outliner = new Outliner(font, style.weight, cw, ch, style.fontSize * s)
  const forms = new Map<number, { name: string; obj: number } | null>()
  const groups = new Map<string, string[]>()
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const cp = chars[i]
      const o = i * 4
      if (isBlank(cp) || fg[o + 3] === 0) continue
      let form = forms.get(cp)
      if (form === undefined) {
        const ops = shapeToPdfOps(outliner.get(cp))
        if (ops) {
          form = { name: `G${forms.size}`, obj: doc.alloc() }
          const bw = cw * 2 + style.fontSize * s
          const bh = ch * 2 + style.fontSize * s * 2
          await doc.setStream(form.obj, `/Type /XObject /Subtype /Form /BBox [${num(-bw)} ${num(-bh)} ${num(bw)} ${num(bh)}]`, ops)
        } else form = null
        forms.set(cp, form)
      }
      if (!form) continue
      const a = fg[o + 3] / 255
      const u = tileColor.get(i) ?? under
      const r = Math.round(u[0] + (fg[o] - u[0]) * a)
      const g = Math.round(u[1] + (fg[o + 1] - u[1]) * a)
      const b = Math.round(u[2] + (fg[o + 2] - u[2]) * a)
      const key = kOp(r, g, b)
      const line = `q 1 0 0 1 ${num(cellX(x) + cw / 2)} ${num(cellTop(y) - ch / 2)} cm /${form.name} Do Q`
      const arr = groups.get(key)
      if (arr) arr.push(line)
      else groups.set(key, [line])
    }
  }
  for (const [op, lines] of groups) out.push(op, lines.join('\n'))

  // Crop marks in registration color
  if (opts.cropMarks) {
    const off = bleed + 1 * MM
    const len = 6 * MM
    const L = tx
    const R = tx + trimW
    const B = ty
    const T = ty + trimH
    const seg = (x1: number, y1: number, x2: number, y2: number) => `${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`
    out.push(
      '1 1 1 1 K 0.25 w',
      seg(L - off, T, L - off - len, T),
      seg(L, T + off, L, T + off + len),
      seg(R + off, T, R + off + len, T),
      seg(R, T + off, R, T + off + len),
      seg(L - off, B, L - off - len, B),
      seg(L, B - off, L, B - off - len),
      seg(R + off, B, R + off + len, B),
      seg(R, B - off, R, B - off - len),
    )
  }

  // Caption
  if (opts.caption && margin >= 8 * MM) {
    const text = `${title} - ${cols} x ${rows} - ASCII Atelier`
    const yText = ty + Math.min(margin / 2, 10 * MM) - 2.5
    const capColor = paintBg ? kOp(...contrastFor(bgRgb)) : '0 0 0 0.85 k'
    out.push(capColor, `BT /F1 6.5 Tf ${num(tx + margin)} ${num(yText)} Td ${pdfString(text)} Tj ET`)
  }

  const xobjects = [...forms.values()]
    .filter((f): f is { name: string; obj: number } => !!f)
    .map((f) => `/${f.name} ${f.obj} 0 R`)
    .join(' ')
  await doc.setStream(content, '', out.join('\n'))
  doc.set(fontObj, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>')
  doc.set(
    page,
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${num(mediaW)} ${num(mediaH)}] ` +
      `/BleedBox [${num(tx - bleed)} ${num(ty - bleed)} ${num(tx + trimW + bleed)} ${num(ty + trimH + bleed)}] ` +
      `/TrimBox [${num(tx)} ${num(ty)} ${num(tx + trimW)} ${num(ty + trimH)}] ` +
      `/Resources << /XObject << ${xobjects} >> /Font << /F1 ${fontObj} 0 R >> >> /Contents ${content} 0 R >>`,
  )
  doc.set(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`)
  doc.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`)
  doc.set(
    info,
    `<< /Title ${pdfString(title)} /Creator (ASCII Atelier) /Producer (ASCII Atelier CMYK PDF) /CreationDate ${pdfDate()} >>`,
  )
  return {
    blob: doc.build(catalog, info),
    traced: outliner.traced.size,
    pageMm: [Math.round((trimW / MM) * 10) / 10, Math.round((trimH / MM) * 10) / 10],
  }
}

function num4(v: number): string {
  return String(Math.round(v * 10000) / 10000)
}

function contrastFor([r, g, b]: [number, number, number]): [number, number, number] {
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return l > 0.5 ? [40, 40, 40] : [235, 235, 235]
}
