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

interface HostDownloads {
  save(req: { filename: string; data: Blob }): Promise<{ status: string }>
}

let hostDownloads: Promise<HostDownloads | null> | null = null

/** When hosted as a claude.ai page, files must be saved through the host's `downloads` capability. */
function getHostDownloads(): Promise<HostDownloads | null> {
  if (!hostDownloads) {
    const host = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude
    hostDownloads =
      typeof host?.use === 'function'
        ? host.use('downloads').then((d) => (d as HostDownloads | null) ?? null, () => null)
        : Promise.resolve(null)
  }
  return hostDownloads
}

const SAVE_ERRORS: Record<string, string> = {
  rejected_extension: 'This file type can’t be saved here.',
  extension_not_enabled: 'This file type can’t be saved here.',
  too_large: 'This file is too large to save here. Try a smaller scale.',
  rate_limited: 'A save is already waiting for your confirmation.',
}

/** Save a file. Resolves false when the viewer declines the host's save prompt. */
export async function downloadBlob(blob: Blob, filename: string): Promise<boolean> {
  const host = await getHostDownloads()
  if (host) {
    try {
      await host.save({ filename, data: blob })
      return true
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'declined') return false
      throw new Error(SAVE_ERRORS[code] ?? 'Saving files isn’t available in this view.')
    }
  }
  saveWithLink(blob, filename)
  return true
}

function saveWithLink(blob: Blob, filename: string): void {
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
