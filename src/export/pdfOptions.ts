import type { CmykOptions } from '../engine/color'

export type PageSize = 'A5' | 'A4' | 'A3' | 'Letter' | 'Tabloid' | 'Square' | 'Fit'

export const PAGE_SIZES: Record<Exclude<PageSize, 'Fit'>, [number, number]> = {
  A5: [148, 210],
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
  Tabloid: [279.4, 431.8],
  Square: [210, 210],
}

export interface PdfOptions {
  page: PageSize
  orientation: 'auto' | 'portrait' | 'landscape'
  marginMm: number
  bleedMm: number
  cropMarks: boolean
  /** Where to paint the background color: nowhere, behind the art, or the full bleed. */
  background: 'none' | 'art' | 'bleed'
  caption: boolean
  cmyk: CmykOptions
}

export const DEFAULT_PDF: PdfOptions = {
  page: 'A4',
  orientation: 'auto',
  marginMm: 15,
  bleedMm: 3,
  cropMarks: true,
  background: 'bleed',
  caption: true,
  cmyk: { richBlack: true, neutralK: true, inkLimit: 300 },
}
