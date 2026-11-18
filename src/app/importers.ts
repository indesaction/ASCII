/**
 * Decoders for formats browsers can't show natively. Each library is loaded
 * on demand, so none of them weigh on the first page load.
 */
import { makeCanvas, type GifAnimation } from './runtime'

const MAX_SIDE = 2048

function fitCanvas(src: CanvasImageSource, w: number, h: number, max = MAX_SIDE): HTMLCanvasElement {
  const s = Math.min(1, max / Math.max(w, h))
  const c = makeCanvas(w * s, h * s)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

// ---------------------------------------------------------------------------
// PDF / Illustrator (.ai files are PDF-compatible)
// ---------------------------------------------------------------------------

export interface PdfHandle {
  pages: number
  render(page: number): Promise<HTMLCanvasElement>
}

export async function openPdf(data: ArrayBuffer): Promise<PdfHandle> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  } catch {
    throw new Error('This PDF could not be opened. It may be password-protected or damaged.')
  }
  return {
    pages: doc.numPages,
    async render(n: number) {
      const page = await doc.getPage(Math.max(1, Math.min(doc.numPages, n)))
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(6, MAX_SIDE / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      const canvas = makeCanvas(viewport.width, viewport.height)
      await page.render({ canvas, viewport, background: 'rgba(0,0,0,0)' }).promise
      return canvas
    },
  }
}

// ---------------------------------------------------------------------------
// TIFF
// ---------------------------------------------------------------------------

export async function decodeTiff(data: ArrayBuffer): Promise<HTMLCanvasElement> {
  const mod = await import('utif')
  const UTIF = (mod as unknown as { default?: typeof mod }).default ?? mod
  const ifds = UTIF.decode(data)
  const img = ifds.find((i) => (i.width ?? 0) > 0) ?? ifds[0]
  if (!img) throw new Error('No image found in this TIFF.')
  UTIF.decodeImage(data, img, ifds)
  const rgba = UTIF.toRGBA8(img)
  const w = img.width as number
  const h = img.height as number
  const c = makeCanvas(w, h)
  c.getContext('2d')!.putImageData(new ImageData(Uint8ClampedArray.from(rgba.subarray(0, w * h * 4)), w, h), 0, 0)
  return fitCanvas(c, w, h)
}

// ---------------------------------------------------------------------------
// EPS — browsers can't run PostScript, so we use the preview the file embeds
// ---------------------------------------------------------------------------

export async function decodeEps(data: ArrayBuffer): Promise<HTMLCanvasElement> {
  const dv = new DataView(data)
  let ps: string
  if (data.byteLength > 30 && dv.getUint32(0, false) === 0xc5d0d3c6) {
    const psOff = dv.getUint32(4, true)
    const psLen = dv.getUint32(8, true)
    const tiffOff = dv.getUint32(20, true)
    const tiffLen = dv.getUint32(24, true)
    if (tiffLen > 0 && tiffOff + tiffLen <= data.byteLength) {
      return decodeTiff(data.slice(tiffOff, tiffOff + tiffLen))
    }
    ps = new TextDecoder('latin1').decode(new Uint8Array(data, psOff, Math.min(psLen, data.byteLength - psOff)))
  } else {
    ps = new TextDecoder('latin1').decode(new Uint8Array(data))
  }
  const m = /%%BeginPreview:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)([\s\S]*?)%%EndPreview/.exec(ps)
  if (m) {
    const w = +m[1]
    const h = +m[2]
    const depth = +m[3]
    const hex = m[5].replace(/[%\s]/g, '')
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
    const rowBytes = Math.ceil((w * depth) / 8)
    const max = (1 << depth) - 1
    const img = new ImageData(w, h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bit = x * depth
        const byte = bytes[y * rowBytes + (bit >> 3)] ?? 0
        const v = (byte >> (8 - depth - (bit & 7))) & max
        // EPSI previews: 0 is black, max is white.
        const g = Math.round((v / max) * 255)
        const o = (y * w + x) * 4
        img.data[o] = img.data[o + 1] = img.data[o + 2] = g
        img.data[o + 3] = 255
      }
    }
    const c = makeCanvas(w, h)
    c.getContext('2d')!.putImageData(img, 0, 0)
    return c
  }
  throw new Error('This EPS has no built-in preview. Save it as PDF or SVG (in Illustrator: Save As → PDF) and add that instead.')
}

// ---------------------------------------------------------------------------
// PSD
// ---------------------------------------------------------------------------

export async function decodePsd(data: ArrayBuffer): Promise<HTMLCanvasElement> {
  const { readPsd } = await import('ag-psd')
  const psd = readPsd(data, { skipLayerImageData: true, skipThumbnail: true })
  if (!psd.canvas) {
    throw new Error('This PSD has no flattened image. In Photoshop, turn on “Maximize Compatibility” when saving.')
  }
  return fitCanvas(psd.canvas, psd.width, psd.height)
}

// ---------------------------------------------------------------------------
// Animated GIF
// ---------------------------------------------------------------------------

export async function decodeGif(data: ArrayBuffer): Promise<GifAnimation> {
  const { parseGIF, decompressFrames } = await import('gifuct-js')
  const gif = parseGIF(data)
  const frames = decompressFrames(gif, true).slice(0, 400)
  const W = gif.lsd.width
  const H = gif.lsd.height
  const s = Math.min(1, 900 / Math.max(W, H))
  const full = makeCanvas(W, H)
  const fctx = full.getContext('2d')!
  const patch = document.createElement('canvas')
  const pctx = patch.getContext('2d')!
  const out: HTMLCanvasElement[] = []
  const ends: number[] = []
  let t = 0
  let restore: ImageData | null = null
  for (const f of frames) {
    const { width, height, left, top } = f.dims
    if (f.disposalType === 3) restore = fctx.getImageData(0, 0, W, H)
    patch.width = width
    patch.height = height
    pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), width, height), 0, 0)
    fctx.drawImage(patch, left, top)
    const frame = makeCanvas(W * s, H * s)
    frame.getContext('2d')!.drawImage(full, 0, 0, frame.width, frame.height)
    out.push(frame)
    t += Math.max(20, f.delay || 100)
    ends.push(t)
    if (f.disposalType === 2) fctx.clearRect(left, top, width, height)
    else if (f.disposalType === 3 && restore) fctx.putImageData(restore, 0, 0)
  }
  if (!out.length) throw new Error('This GIF has no frames.')
  return { frames: out, ends, total: t }
}

// ---------------------------------------------------------------------------
// Existing ASCII art (.txt, .ans — including our own 24-bit ANSI exports)
// ---------------------------------------------------------------------------

export interface AsciiCell {
  x: number
  y: number
  ch: number
  rgb: [number, number, number] | null
}

export function parseAsciiText(text: string): { cells: AsciiCell[]; cols: number; rows: number } {
  const cells: AsciiCell[] = []
  let cols = 0
  let fg: [number, number, number] | null = null
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  lines.forEach((line, y) => {
    let x = 0
    for (let i = 0; i < line.length; ) {
      if (line.charCodeAt(i) === 27 && line[i + 1] === '[') {
        const end = line.slice(i + 2).search(/[A-Za-z]/)
        if (end < 0) break
        const params = line.slice(i + 2, i + 2 + end).split(';').map(Number)
        const cmd = line[i + 2 + end]
        if (cmd === 'm') {
          for (let k = 0; k < params.length; k++) {
            if (params[k] === 0) fg = null
            else if (params[k] === 38 && params[k + 1] === 2) {
              fg = [params[k + 2], params[k + 3], params[k + 4]]
              k += 4
            } else if (params[k] === 48 && params[k + 1] === 2) k += 4
          }
        }
        i += 3 + end
        continue
      }
      const cp = line.codePointAt(i)!
      i += cp > 0xffff ? 2 : 1
      if (cp === 9) {
        x += 4 - (x % 4)
        continue
      }
      if (cp !== 32) cells.push({ x, y, ch: cp, rgb: fg })
      x++
    }
    cols = Math.max(cols, x)
  })
  return { cells, cols: Math.max(1, cols), rows: Math.max(1, lines.length) }
}
