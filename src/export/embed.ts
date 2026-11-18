import { fontUrl } from '../app/fonts'
import { buildRamp, charsetString } from '../engine/ramp'
import type { PlayerData } from '../player/types'
import { bytesToB64 } from '../util/base64'
import { escapeXml, snapshot } from './common'

export interface EmbedOptions {
  embedFont: boolean
}

/** A single self-contained HTML file that plays the animation (and magnet) anywhere. */
export async function exportEmbed(opts: EmbedOptions): Promise<Blob> {
  const { frame, shape, style, motion, title } = snapshot()
  const { default: player } = await import('../generated/player.js?raw')
  let chars = ''
  for (let i = 0; i < frame.chars.length; i++) chars += String.fromCodePoint(frame.chars[i] || 32)
  const ink = new Uint8Array(frame.ink.length)
  for (let i = 0; i < ink.length; i++) ink[i] = Math.round(Math.max(0, Math.min(1, frame.ink[i])) * 255)
  const ramp = buildRamp(charsetString(shape), style.weight, shape.keepOrder)
  const rampStr = String.fromCodePoint(...ramp.chars)
  const data: PlayerData = {
    v: 1,
    title,
    cols: frame.cols,
    rows: frame.rows,
    chars,
    fg: bytesToB64(frame.fg),
    bg: frame.bg ? bytesToB64(frame.bg) : null,
    ink: bytesToB64(ink),
    ramp: rampStr,
    pool: rampStr.replace(/ /g, '').length >= 6 ? rampStr : rampStr + '01#%&*+=<>/\\|{}[]?!$@',
    style: {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      weight: style.weight,
      padding: style.padding,
      background: style.background,
      transparent: style.transparent,
    },
    motion: {
      animation: motion.animation,
      speed: motion.speed,
      intensity: motion.intensity,
      duration: motion.duration,
      highlight: motion.highlight,
      magnet: motion.magnet,
    },
  }
  if (opts.embedFont) {
    const buf = await fetch(fontUrl(style.weight)).then((r) => r.arrayBuffer())
    data.font = bytesToB64(new Uint8Array(buf))
  }
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  const bg = style.transparent ? 'transparent' : style.background
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)}</title>
<style>
html,body{margin:0;height:100%;background:${bg}}
#ascii-root{position:fixed;inset:0;display:grid;place-items:center;overflow:hidden}
</style>
</head>
<body>
<div id="ascii-root" role="img" aria-label="${escapeXml(title)} — ASCII art"></div>
<script type="application/json" id="ascii-data">${json}</script>
<script>${player.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`
  return new Blob([html], { type: 'text/html' })
}
