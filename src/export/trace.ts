import { BASELINE_FROM_CENTER, FONT_STACK } from '../engine/glyphs'

export type Pt = [number, number]

/**
 * Vectorize a glyph the bundled font doesn't contain (e.g. katakana, emoji
 * silhouettes): render it large with the system font, trace pixel boundaries
 * into closed polygons, then simplify. Fill with the even-odd rule.
 * Returned coordinates are in em units relative to the cell center (y-down).
 */
export function traceGlyph(ch: string, weight: number): Pt[][] {
  const R = 128
  const W = Math.ceil(R * 1.6)
  const H = Math.ceil(R * 1.8)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  ctx.font = `${weight} ${R}px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(ch, W / 2, H / 2 + BASELINE_FROM_CENTER * R)
  const data = ctx.getImageData(0, 0, W, H).data
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3] > 127

  // Directed boundary edges, keeping the inside on the right-hand side.
  const next = new Map<number, number[]>()
  const key = (x: number, y: number) => y * (W + 1) + x
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0)
    const arr = next.get(k)
    if (arr) arr.push(key(x1, y1))
    else next.set(k, [key(x1, y1)])
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue
      if (!inside(x, y - 1)) add(x, y, x + 1, y)
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1)
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1)
      if (!inside(x - 1, y)) add(x, y + 1, x, y)
    }
  }

  const loops: Pt[][] = []
  for (const [startKey, targets] of next) {
    while (targets.length) {
      const loop: Pt[] = []
      let k = startKey
      for (let guard = 0; guard < 200000; guard++) {
        const list = next.get(k)
        if (!list || list.length === 0) break
        const n = list.pop()!
        loop.push([k % (W + 1), Math.floor(k / (W + 1))])
        k = n
        if (k === startKey) break
      }
      if (loop.length >= 4) loops.push(loop)
    }
  }

  const s = 1 / R
  return loops
    .map((l) => simplifyClosed(removeCollinear(l), 0.75))
    .filter((l) => l.length >= 3)
    .map((l) => l.map(([x, y]) => [(x - W / 2) * s, (y - H / 2) * s] as Pt))
}

function removeCollinear(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n]
    const b = pts[i]
    const c = pts[(i + 1) % n]
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b)
  }
  return out
}

function simplifyClosed(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 4) return pts
  // Split at the point farthest from the first one, simplify both halves.
  let far = 0
  let best = -1
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2
    if (d > best) {
      best = d
      far = i
    }
  }
  const a = rdp(pts.slice(0, far + 1), eps)
  const b = rdp([...pts.slice(far), pts[0]], eps)
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts
  const [x0, y0] = pts[0]
  const [x1, y1] = pts[pts.length - 1]
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  let idx = 0
  let max = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x1 * y0 - y1 * x0) / len
    if (d > max) {
      max = d
      idx = i
    }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]]
  const left = rdp(pts.slice(0, idx + 1), eps)
  const right = rdp(pts.slice(idx), eps)
  return [...left.slice(0, -1), ...right]
}
