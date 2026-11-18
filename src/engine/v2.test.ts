import { describe, expect, it } from 'vitest'
import { PointerTracker } from '../anim/interact'
import { boardToLayer } from '../app/brush'
import { parseAsciiText } from '../app/importers'
import type { LayerMeta } from '../state/store'

const layer = (patch: Partial<LayerMeta>): LayerMeta => ({
  id: 'a',
  name: 'a',
  kind: 'image',
  visible: true,
  opacity: 1,
  blend: 'source-over',
  x: 100,
  y: 100,
  scale: 1,
  rotation: 0,
  width: 200,
  height: 100,
  ...patch,
})

describe('ASCII text import', () => {
  it('reads plain characters and skips spaces', () => {
    const r = parseAsciiText(' ab\nc d\n')
    expect(r.cols).toBe(3)
    expect(r.rows).toBe(2)
    expect(r.cells.map((c) => `${c.x},${c.y},${String.fromCodePoint(c.ch)}`)).toEqual(['1,0,a', '2,0,b', '0,1,c', '2,1,d'])
  })

  it('keeps 24-bit ANSI colors', () => {
    const r = parseAsciiText('\x1b[38;2;10;20;30mX\x1b[48;2;1;2;3mY\x1b[0mZ')
    expect(r.cells).toEqual([
      { x: 0, y: 0, ch: 88, rgb: [10, 20, 30] },
      { x: 1, y: 0, ch: 89, rgb: [10, 20, 30] },
      { x: 2, y: 0, ch: 90, rgb: null },
    ])
  })
})

describe('layer coordinates', () => {
  it('maps board points into layer pixels through scale and rotation', () => {
    const l = layer({ scale: 2 })
    expect(boardToLayer(l, { width: 200, height: 100 }, 100, 100)).toEqual({ x: 100, y: 50 })
    expect(boardToLayer(l, { width: 200, height: 100 }, 300, 200)).toEqual({ x: 200, y: 100 })
    const r = boardToLayer(layer({ rotation: Math.PI / 2 }), { width: 200, height: 100 }, 100, 150)
    expect(r.x).toBeCloseTo(150)
    expect(r.y).toBeCloseTo(50)
  })

  it('scales into a smaller mask', () => {
    const q = boardToLayer(layer({}), { width: 100, height: 50 }, 200, 150)
    expect(q).toEqual({ x: 100, y: 50 })
  })
})

describe('pointer tracker', () => {
  it('records taps and forgets them over time', () => {
    const t = new PointerTracker()
    t.press(5, 5, 10)
    t.release()
    const s = t.state(10.5, { mode: 'ripple', strength: 1, radius: 8 }, 40, 20)
    expect(s.taps).toHaveLength(1)
    expect(s.taps[0].age).toBeCloseTo(0.5)
    t.leave()
    expect(t.busy(11)).toBe(true)
    expect(t.state(20, { mode: 'ripple', strength: 1, radius: 8 }, 40, 20).taps).toHaveLength(0)
  })
})
