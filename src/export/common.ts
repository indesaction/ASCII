import type { Prepared } from '../anim/compose'
import { studio } from '../app/studio'
import { cellMetrics } from '../engine/convert'
import type { AsciiFrame, MotionSettings, ShapeSettings, StyleSettings } from '../engine/types'
import { useApp } from '../state/store'

export interface Snapshot {
  frame: AsciiFrame
  prep: Prepared
  shape: ShapeSettings
  style: StyleSettings
  motion: MotionSettings
  title: string
  cellW: number
  cellH: number
}

export function snapshot(): Snapshot {
  const frame = studio.frame
  const prep = studio.prep
  if (!frame || !prep) throw new Error('Nothing to export yet. Add an image first.')
  const s = useApp.getState()
  const { w, h } = cellMetrics(s.style)
  return { frame, prep, shape: s.shape, style: s.style, motion: s.motion, title: s.title, cellW: w, cellH: h }
}

export function fileBase(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 40)
  return `ascii-${slug || 'atelier'}`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Native share sheet (mobile). Returns false when unsupported. */
export async function shareBlob(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false
  try {
    await nav.share({ files: [file], title })
    return true
  } catch (err) {
    // AbortError = user closed the sheet; treat as handled.
    return (err as Error).name === 'AbortError'
  }
}

export const nextTick = () => new Promise<void>((r) => setTimeout(r, 0))

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
}

export function hex2(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
}
