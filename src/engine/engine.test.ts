import { describe, expect, it } from 'vitest'
import { EditLayer } from '../app/edits'
import { PdfDoc, pdfString } from '../export/pdfWriter'
import { cmykToProofRgb, extractPalette, hexToRgb, nearestColor, rgbToCmyk, rgbToHex } from './color'
import { cellMetrics, gridFor, toneLut } from './convert'
import { quantize } from './dither'
import { BRAILLE_BIT, blockRects, brailleDots, geometricCoverage } from './glyphs'
import { nearestLevel } from './ramp'
import { createFrame } from './types'

const OPTS = { richBlack: false, neutralK: false, inkLimit: 400 }

describe('color', () => {
  it('round-trips hex', () => {
    expect(rgbToHex(...hexToRgb('#ff4a1c'))).toBe('#ff4a1c')
    expect(hexToRgb('#abc')).toEqual([170, 187, 204])
  })

  it('converts primaries to CMYK', () => {
    expect(rgbToCmyk(255, 0, 0, OPTS)).toEqual([0, 1, 1, 0])
    expect(rgbToCmyk(0, 255, 255, OPTS)).toEqual([1, 0, 0, 0])
    expect(rgbToCmyk(255, 255, 255, OPTS)).toEqual([0, 0, 0, 0])
    expect(rgbToCmyk(0, 0, 0, OPTS)).toEqual([0, 0, 0, 1])
  })

  it('applies rich black, neutral K and the ink limit', () => {
    expect(rgbToCmyk(0, 0, 0, { ...OPTS, richBlack: true })).toEqual([0.6, 0.4, 0.4, 1])
    const gray = rgbToCmyk(128, 128, 128, { ...OPTS, neutralK: true })
    expect(gray[0] + gray[1] + gray[2]).toBe(0)
    expect(gray[3]).toBeGreaterThan(0.4)
    const [c, m, y, k] = rgbToCmyk(40, 10, 60, { ...OPTS, inkLimit: 240 })
    expect(c + m + y + k).toBeLessThanOrEqual(2.4001)
  })

  it('simulates print: paper is near white, full K is near black', () => {
    const paper = cmykToProofRgb([0, 0, 0, 0])
    expect(Math.min(...paper)).toBeGreaterThan(240)
    const black = cmykToProofRgb([0, 0, 0, 1])
    expect(Math.max(...black)).toBeLessThan(40)
  })

  it('finds the nearest palette color', () => {
    const pal = [hexToRgb('#000000'), hexToRgb('#ff0000'), hexToRgb('#ffffff')]
    expect(nearestColor(pal, 250, 20, 10)).toBe(1)
    expect(nearestColor(pal, 240, 240, 240)).toBe(2)
  })

  it('extracts dominant colors with k-means', () => {
    const data = new Uint8ClampedArray(400 * 4)
    for (let i = 0; i < 400; i++) {
      const red = i < 200
      data.set(red ? [230, 20, 20, 255] : [20, 20, 230, 255], i * 4)
    }
    const pal = extractPalette(data, 2)
    expect(pal).toHaveLength(2)
    const hexes = pal.map((c) => rgbToHex(...c))
    expect(hexes).toContain('#e61414')
    expect(hexes).toContain('#1414e6')
  })
})

describe('grid', () => {
  const style = { fontSize: 10, lineHeight: 1, letterSpacing: 0 }
  it('corrects for the character aspect ratio', () => {
    expect(cellMetrics(style)).toEqual({ w: 6, h: 10 })
    // A square image at 100 columns needs 60 rows of 0.6-aspect cells.
    expect(gridFor(1000, 1000, 100, style)).toEqual({ cols: 100, rows: 60 })
  })

  it('builds a monotonic tone curve', () => {
    const lut = toneLut({ brightness: 0, contrast: 0.4, gamma: 1.3 })
    for (let i = 1; i < 256; i++) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1])
    expect(lut[0]).toBe(0)
    expect(lut[255]).toBe(1)
  })
})

describe('dithering', () => {
  const levels = new Float32Array([0, 0.5, 1])
  it('maps to the nearest level without dithering', () => {
    expect(nearestLevel(levels, 0.2)).toBe(0)
    expect(nearestLevel(levels, 0.3)).toBe(1)
    expect(nearestLevel(levels, 0.9)).toBe(2)
  })

  for (const mode of ['floyd', 'atkinson', 'bayer'] as const) {
    it(`${mode} preserves average tone`, () => {
      const w = 32
      const h = 32
      const vals = new Float32Array(w * h).fill(0.25)
      const q = quantize(vals, w, h, new Float32Array([0, 1]), mode)
      const mean = q.reduce((s, v) => s + v, 0) / q.length
      expect(mean).toBeGreaterThan(0.15)
      expect(mean).toBeLessThan(0.35)
    })
  }

  it('respects the mask', () => {
    const vals = new Float32Array([1, 1, 1, 1])
    const q = quantize(vals, 2, 2, new Float32Array([0, 1]), 'floyd', new Uint8Array([1, 0, 1, 0]))
    expect(Array.from(q)).toEqual([1, 0, 1, 0])
  })
})

describe('glyph geometry', () => {
  it('knows block element coverage', () => {
    expect(blockRects(0x2588)).toEqual([[0, 0, 1, 1]])
    expect(geometricCoverage(0x2580)).toBe(0.5)
    expect(geometricCoverage(0x2599)).toBeCloseTo(0.75)
  })

  it('maps braille bits to dot positions', () => {
    expect(brailleDots(0x2800)).toHaveLength(0)
    expect(brailleDots(0x28ff)).toHaveLength(8)
    expect(brailleDots(0x2800 + BRAILLE_BIT[1][3])).toEqual([[0.7, 0.875]])
  })
})

describe('edit layer', () => {
  it('overlays edits and supports undo/redo', () => {
    const base = createFrame(4, 2)
    base.fg.fill(255)
    const layer = new EditLayer()
    layer.begin()
    layer.set(1, 1, { ch: 35, r: 255, g: 0, b: 0, a: 255 })
    layer.set(2, 0, { ch: 64, r: 0, g: 0, b: 0, a: -1 })
    layer.end()
    let f = layer.apply(base)
    expect(f.chars[1 * 4 + 1]).toBe(35)
    expect(Array.from(f.fg.slice((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 3))).toEqual([255, 0, 0])
    expect(f.chars[2]).toBe(64)
    expect(base.chars[2]).toBe(32)
    expect(layer.undo()).toBe(true)
    expect(layer.size).toBe(0)
    expect(layer.redo()).toBe(true)
    expect(layer.size).toBe(2)
    layer.clear()
    f = layer.apply(base)
    expect(f).toBe(base)
    layer.undo()
    expect(layer.size).toBe(2)
  })

  it('ignores edits outside a smaller grid', () => {
    const layer = new EditLayer()
    layer.set(10, 10, { ch: 35, r: 0, g: 0, b: 0, a: -1 })
    const f = layer.apply(createFrame(4, 4))
    expect(Array.from(f.chars).every((c) => c === 32)).toBe(true)
  })
})

describe('pdf writer', () => {
  it('writes a well-formed file with a correct xref table', async () => {
    const doc = new PdfDoc()
    const cat = doc.alloc()
    const pages = doc.alloc()
    const page = doc.alloc()
    const content = doc.alloc()
    const info = doc.alloc()
    await doc.setStream(content, '', '0 0 0 1 k 10 10 100 100 re f', false)
    doc.set(page, `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 200 200] /Contents ${content} 0 R >>`)
    doc.set(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`)
    doc.set(cat, `<< /Type /Catalog /Pages ${pages} 0 R >>`)
    doc.set(info, `<< /Title ${pdfString('Test (1)')} >>`)
    const bytes = new Uint8Array(await doc.build(cat, info).arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.6')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(startxref, startxref + 4)).toBe('xref')
    // Every xref offset must point at "n 0 obj".
    const entries = text.slice(startxref).split('\n').slice(3, 3 + 5)
    entries.forEach((line, i) => {
      const off = Number(line.slice(0, 10))
      expect(text.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    })
    expect(text).toContain('/Title (Test \\(1\\))')
  })
})
