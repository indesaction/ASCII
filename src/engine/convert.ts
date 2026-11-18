import { clamp, hexToRgb, luminance, nearestColor, sampleGradient } from './color'
import { quantize } from './dither'
import { BRAILLE_BIT, FONT_ADVANCE, toCodepoints } from './glyphs'
import { PALETTES } from './presets'
import { buildRamp, charsetString, glyphShapes, nearestLevel } from './ramp'
import type { AsciiFrame, RGB, ShapeSettings, SourceFrame, StyleSettings } from './types'
import { BLANK_BRAILLE, createFrame } from './types'

type Metrics = Pick<StyleSettings, 'fontSize' | 'lineHeight' | 'letterSpacing'>

/** Size of one character cell in CSS pixels (at 1× zoom). */
export function cellMetrics(style: Metrics): { w: number; h: number } {
  const w = Math.max(style.fontSize * 0.2, style.fontSize * FONT_ADVANCE + style.letterSpacing)
  const h = Math.max(style.fontSize * 0.3, style.fontSize * style.lineHeight)
  return { w, h }
}

export function gridFor(srcW: number, srcH: number, columns: number, style: Metrics): { cols: number; rows: number } {
  const { w, h } = cellMetrics(style)
  const cols = Math.max(4, Math.min(1000, Math.round(columns)))
  const rows = Math.max(1, Math.min(1000, Math.round(cols * (srcH / Math.max(1, srcW)) * (w / h))))
  return { cols, rows }
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

const canvases: HTMLCanvasElement[] = []

function scratch(i: number, w: number, h: number): CanvasRenderingContext2D {
  let c = canvases[i]
  if (!c) {
    c = document.createElement('canvas')
    canvases[i] = c
  }
  // Exact sizes: filtering must never read stale pixels beyond the drawn area.
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  const ctx = c.getContext('2d', { willReadFrequently: i === 0 })!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

/** Draw a source into a w×h RGBA buffer with progressive (high quality) downscaling. */
export function samplePixels(src: SourceFrame, w: number, h: number): Uint8ClampedArray {
  let el: CanvasImageSource = src.el
  let ew = src.width
  let eh = src.height
  let step = 0
  while (ew / 2 >= w * 2 && eh / 2 >= h * 2 && step < 6) {
    const nw = Math.ceil(ew / 2)
    const nh = Math.ceil(eh / 2)
    const ctx = scratch(1 + (step % 2), nw, nh)
    ctx.drawImage(el, 0, 0, ew, eh, 0, 0, nw, nh)
    el = ctx.canvas
    ew = nw
    eh = nh
    step++
  }
  const ctx = scratch(0, w, h)
  if (src.mirror) ctx.setTransform(-1, 0, 0, 1, w, 0)
  ctx.drawImage(el, 0, 0, ew, eh, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

// ---------------------------------------------------------------------------
// Tone
// ---------------------------------------------------------------------------

export function toneLut(shape: Pick<ShapeSettings, 'brightness' | 'contrast' | 'gamma'>): Float32Array {
  const lut = new Float32Array(256)
  const c = shape.contrast
  const k = c >= 0 ? 1 + c * 3 : 1 + c * 0.9
  const g = 1 / Math.max(0.05, shape.gamma)
  for (let i = 0; i < 256; i++) {
    let v = i / 255 + shape.brightness * 0.5
    v = (v - 0.5) * k + 0.5
    v = clamp(v)
    lut[i] = Math.pow(v, g)
  }
  return lut
}

export function resolvePalette(style: Pick<StyleSettings, 'paletteId' | 'customPalette'>): string[] {
  if (style.paletteId === 'custom' && style.customPalette.length) return style.customPalette
  const p = PALETTES.find((x) => x.id === style.paletteId)
  return p && p.colors.length ? p.colors : PALETTES[0].colors
}

type Colorize = (
  r: number,
  g: number,
  b: number,
  tone: number,
  ink: number,
  x: number,
  y: number,
  out: Uint8Array,
  o: number,
) => void

function makeColorizer(style: StyleSettings, cols: number, rows: number, pixels: boolean): Colorize {
  const bg = hexToRgb(style.background)
  const ink = hexToRgb(style.ink)
  const sat = style.saturation
  const stops = (style.gradient.length ? style.gradient : ['#000000', '#ffffff']).map(hexToRgb)
  const palette = resolvePalette(style).map(hexToRgb)
  const axis = style.gradientAxis
  const { w: cw, h: ch } = cellMetrics(style)
  const maxR = Math.hypot((cols * cw) / 2, (rows * ch) / 2) || 1
  const tmp: RGB = [0, 0, 0]
  const mode = style.colorMode

  return (r, g, b, tone, inkV, x, y, out, o) => {
    let R = r
    let G = g
    let B = b
    if (mode === 'mono') {
      if (pixels) {
        R = bg[0] + (ink[0] - bg[0]) * inkV
        G = bg[1] + (ink[1] - bg[1]) * inkV
        B = bg[2] + (ink[2] - bg[2]) * inkV
      } else {
        R = ink[0]
        G = ink[1]
        B = ink[2]
      }
    } else if (mode === 'gradient') {
      let t = tone
      if (axis === 'x') t = cols > 1 ? x / (cols - 1) : 0.5
      else if (axis === 'y') t = rows > 1 ? y / (rows - 1) : 0.5
      else if (axis === 'diagonal') t = (x / Math.max(1, cols - 1) + y / Math.max(1, rows - 1)) / 2
      else if (axis === 'radial') t = Math.hypot((x + 0.5 - cols / 2) * cw, (y + 0.5 - rows / 2) * ch) / maxR
      sampleGradient(stops, t, tmp)
      R = tmp[0]
      G = tmp[1]
      B = tmp[2]
    } else {
      if (sat !== 1) {
        const L = 0.2126 * R + 0.7152 * G + 0.0722 * B
        R = L + (R - L) * sat
        G = L + (G - L) * sat
        B = L + (B - L) * sat
      }
      if (mode === 'palette') {
        const p = palette[nearestColor(palette, R, G, B)]
        R = p[0]
        G = p[1]
        B = p[2]
      }
    }
    out[o] = R < 0 ? 0 : R > 255 ? 255 : R
    out[o + 1] = G < 0 ? 0 : G > 255 ? 255 : G
    out[o + 2] = B < 0 ? 0 : B > 255 ? 255 : B
  }
}

/** Whether ink is lighter than the background (bright pixels get dense glyphs). */
export function lightOnDark(style: Pick<StyleSettings, 'colorMode' | 'ink' | 'background'>): boolean {
  const bg = hexToRgb(style.background)
  if (style.colorMode === 'mono') {
    const ink = hexToRgb(style.ink)
    return luminance(ink[0], ink[1], ink[2]) > luminance(bg[0], bg[1], bg[2])
  }
  return luminance(bg[0], bg[1], bg[2]) < 0.5
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

export function convert(src: SourceFrame, shape: ShapeSettings, style: StyleSettings): AsciiFrame {
  const { cols, rows } = gridFor(src.width, src.height, shape.columns, style)
  const mode = shape.mode
  const detail = mode === 'density' && shape.detail
  const sx = mode === 'braille' || mode === 'contour' || detail ? 2 : 1
  const sy = mode === 'braille' ? 4 : mode === 'pixels' || mode === 'contour' ? 2 : detail ? 3 : 1
  const sw = cols * sx
  const sh = rows * sy
  const px = samplePixels(src, sw, sh)
  const S = sw * sh

  const lut = toneLut(shape)
  const lod = lightOnDark(style)
  const tone = new Float32Array(S)
  const ink = new Float32Array(S)
  const alpha = new Float32Array(S)
  for (let i = 0, p = 0; i < S; i++, p += 4) {
    const al = px[p + 3] / 255
    const t = lut[(54 * px[p] + 183 * px[p + 1] + 19 * px[p + 2]) >> 8]
    tone[i] = t
    alpha[i] = al
    if (src.mask) {
      ink[i] = shape.invert ? 1 - al : al
    } else {
      const base = lod ? t : 1 - t
      ink[i] = (shape.invert ? 1 - base : base) * al
    }
  }

  // Per-cell averages (colors are alpha-weighted).
  const n = cols * rows
  const cr = new Float32Array(n)
  const cg = new Float32Array(n)
  const cb = new Float32Array(n)
  const ct = new Float32Array(n)
  const ci = new Float32Array(n)
  const ca = new Float32Array(n)
  const k = sx * sy
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sr = 0
      let sg = 0
      let sb = 0
      let sa = 0
      let st = 0
      let si = 0
      for (let dy = 0; dy < sy; dy++) {
        let s = (y * sy + dy) * sw + x * sx
        for (let dx = 0; dx < sx; dx++, s++) {
          const a = alpha[s]
          const p = s * 4
          sr += px[p] * a
          sg += px[p + 1] * a
          sb += px[p + 2] * a
          sa += a
          st += tone[s]
          si += ink[s]
        }
      }
      const i = y * cols + x
      if (sa > 0) {
        cr[i] = sr / sa
        cg[i] = sg / sa
        cb[i] = sb / sa
      }
      ct[i] = st / k
      ci[i] = si / k
      ca[i] = sa / k
    }
  }

  const tint = style.cellTint > 0 && mode !== 'pixels'
  const frame = createFrame(cols, rows, tint || mode === 'pixels')
  const { chars, fg } = frame
  const colorize = makeColorizer(style, cols, rows, mode === 'pixels')
  const visible = (i: number) => ca[i] > 0.02

  if (mode === 'pixels') {
    const bgArr = frame.bg!
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const top = 2 * y * sw + x
        const bot = top + sw
        const at = alpha[top] > 0.5
        const ab = alpha[bot] > 0.5
        const pt = top * 4
        const pb = bot * 4
        frame.ink[i] = (ink[top] + ink[bot]) / 2
        if (at) {
          chars[i] = 0x2580
          colorize(px[pt], px[pt + 1], px[pt + 2], tone[top], ink[top], x, y, fg, i * 4)
          fg[i * 4 + 3] = 255
          if (ab) {
            colorize(px[pb], px[pb + 1], px[pb + 2], tone[bot], ink[bot], x, y, bgArr, i * 4)
            bgArr[i * 4 + 3] = 255
          }
        } else if (ab) {
          chars[i] = 0x2584
          colorize(px[pb], px[pb + 1], px[pb + 2], tone[bot], ink[bot], x, y, fg, i * 4)
          fg[i * 4 + 3] = 255
        }
      }
    }
    return frame
  }

  if (mode === 'braille') {
    const dw = sw
    const dh = sh
    let bits: Uint16Array
    if (shape.dither === 'none') {
      bits = new Uint16Array(S)
      for (let i = 0; i < S; i++) bits[i] = ink[i] > shape.threshold ? 1 : 0
    } else {
      const biased = new Float32Array(S)
      for (let i = 0; i < S; i++) biased[i] = ink[i] + (0.5 - shape.threshold)
      bits = quantize(biased, dw, dh, new Float32Array([0, 1]), shape.dither)
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let b = 0
        let count = 0
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            if (bits[(y * 4 + dy) * dw + x * 2 + dx]) {
              b |= BRAILLE_BIT[dx][dy]
              count++
            }
          }
        }
        const i = y * cols + x
        chars[i] = BLANK_BRAILLE + b
        frame.ink[i] = count / 8
      }
    }
  } else if (mode === 'contour') {
    const ramp = buildRamp(charsetString(shape), style.weight, shape.keepOrder)
    const at = (x: number, y: number) => {
      x = x < 0 ? 0 : x >= sw ? sw - 1 : x
      y = y < 0 ? 0 : y >= sh ? sh - 1 : y
      return ink[y * sw + x]
    }
    const thr = shape.edgeThreshold
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        let best = 0
        let bgx = 0
        let bgy = 0
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const X = x * 2 + dx
            const Y = y * 2 + dy
            const gx =
              at(X + 1, Y - 1) + 2 * at(X + 1, Y) + at(X + 1, Y + 1) - at(X - 1, Y - 1) - 2 * at(X - 1, Y) - at(X - 1, Y + 1)
            const gy =
              at(X - 1, Y + 1) + 2 * at(X, Y + 1) + at(X + 1, Y + 1) - at(X - 1, Y - 1) - 2 * at(X, Y - 1) - at(X + 1, Y - 1)
            const m = gx * gx + gy * gy
            if (m > best) {
              best = m
              bgx = gx
              bgy = gy
            }
          }
        }
        const mag = Math.min(1, Math.sqrt(best) / 4)
        if (mag > thr) {
          let a = (Math.atan2(bgy, bgx) * 180) / Math.PI
          if (a < 0) a += 180
          chars[i] = a < 22.5 || a >= 157.5 ? 124 : a < 67.5 ? 47 : a < 112.5 ? 45 : 92
          frame.ink[i] = Math.max(ci[i], mag)
        } else if (shape.edgeFill && visible(i)) {
          chars[i] = ramp.chars[nearestLevel(ramp.density, ci[i] * 0.85)]
          frame.ink[i] = ci[i]
        } else {
          chars[i] = 32
        }
      }
    }
  } else if (mode === 'phrase') {
    const phrase = toCodepoints(shape.phrase || 'ASCII ')
    const len = phrase.length
    let p = 0
    for (let i = 0; i < n; i++) {
      frame.ink[i] = ci[i]
      if (!visible(i)) continue
      if (shape.phraseShading === 'threshold') {
        if (ci[i] > shape.threshold) chars[i] = phrase[p++ % len]
      } else if (ci[i] > 0.02) {
        chars[i] = phrase[p++ % len]
      }
    }
  } else {
    const ramp = buildRamp(charsetString(shape), style.weight, shape.keepOrder)
    const mask = new Uint8Array(n)
    for (let i = 0; i < n; i++) mask[i] = visible(i) ? 1 : 0
    if (detail) {
      const shapes = glyphShapes(ramp, style.weight)
      const G = ramp.chars.length
      const memo = new Int16Array(1 << 18).fill(-1)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x
          frame.ink[i] = ci[i]
          if (!mask[i]) continue
          let key = 0
          let sum = 0
          let sq = 0
          const v = [0, 0, 0, 0, 0, 0]
          for (let ry = 0; ry < 3; ry++) {
            for (let rx = 0; rx < 2; rx++) {
              const s = (y * 3 + ry) * sw + x * 2 + rx
              const val = clamp(ink[s])
              sum += val
              sq += val * val
              const q = Math.min(7, Math.round(val * 7))
              v[ry * 2 + rx] = q / 7
              key = (key << 3) | q
            }
          }
          // Flat cells keep the rich density mapping; cells with real
          // structure (an edge inside the cell) are matched by silhouette.
          if (sq - (sum * sum) / 6 < 0.06) {
            chars[i] = ramp.chars[nearestLevel(ramp.density, ci[i])]
            continue
          }
          let g = memo[key]
          if (g < 0) {
            const meanV = (v[0] + v[1] + v[2] + v[3] + v[4] + v[5]) / 6
            {
              let bestD = Infinity
              g = 0
              for (let j = 0; j < G; j++) {
                const meanG = ramp.density[j]
                let d = 0
                for (let m = 0; m < 6; m++) {
                  const e = v[m] - meanV - (shapes[j * 6 + m] - meanG)
                  d += e * e
                }
                const t = meanV - meanG
                d += 3 * t * t
                if (d < bestD) {
                  bestD = d
                  g = j
                }
              }
            }
            memo[key] = g
          }
          chars[i] = ramp.chars[g]
        }
      }
    } else {
      const lv = quantize(ci, cols, rows, ramp.density, shape.dither, mask)
      for (let i = 0; i < n; i++) {
        frame.ink[i] = ci[i]
        if (mask[i]) chars[i] = ramp.chars[lv[i]]
      }
    }
  }

  // Colors
  const bgArr = frame.bg
  const shadeOpacity = mode === 'phrase' && shape.phraseShading === 'opacity'
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const o = i * 4
      colorize(cr[i], cg[i], cb[i], ct[i], ci[i], x, y, fg, o)
      fg[o + 3] = shadeOpacity ? Math.round(255 * Math.pow(clamp(ci[i]), 0.85)) : 255
      if (tint && bgArr && visible(i)) {
        bgArr[o] = fg[o]
        bgArr[o + 1] = fg[o + 1]
        bgArr[o + 2] = fg[o + 2]
        bgArr[o + 3] = Math.round(255 * style.cellTint * ca[i])
      }
    }
  }
  return frame
}

/** Small RGBA sample of the source (for palette extraction). */
export function thumbnailPixels(src: SourceFrame, max = 72): Uint8ClampedArray {
  const s = Math.min(1, max / Math.max(src.width, src.height))
  return samplePixels(src, Math.max(1, Math.round(src.width * s)), Math.max(1, Math.round(src.height * s)))
}
