/** Data embedded in an exported "web embed" HTML file. */
export interface PlayerData {
  v: 1
  title: string
  cols: number
  rows: number
  /** One code point per cell, row-major. */
  chars: string
  /** Base64 RGBA per cell. */
  fg: string
  bg: string | null
  /** Base64, one byte (0-255) of ink per cell. */
  ink: string
  ramp: string
  pool: string
  style: {
    fontSize: number
    lineHeight: number
    letterSpacing: number
    weight: number
    padding: number
    background: string
    transparent: boolean
  }
  motion: {
    animation: string
    speed: number
    intensity: number
    duration: number
    highlight: string
    magnet: boolean
  }
  /** Base64 WOFF of the monospace font, if embedded. */
  font?: string
}
