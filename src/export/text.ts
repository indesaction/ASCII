import { hexToRgb } from '../engine/color'
import { FONT_STACK } from '../engine/glyphs'
import type { AsciiFrame, StyleSettings } from '../engine/types'
import { BLANK_BRAILLE, isBlank } from '../engine/types'
import { escapeXml, hex2 } from './common'

function charAt(f: AsciiFrame, i: number): string {
  const cp = f.chars[i]
  if (f.fg[i * 4 + 3] === 0) return ' '
  if (cp === BLANK_BRAILLE) return String.fromCodePoint(cp)
  return isBlank(cp) ? ' ' : String.fromCodePoint(cp)
}

export function toPlainText(f: AsciiFrame, trimRight = true): string {
  const lines: string[] = []
  for (let y = 0; y < f.rows; y++) {
    let line = ''
    for (let x = 0; x < f.cols; x++) line += charAt(f, y * f.cols + x)
    lines.push(trimRight ? line.replace(/[ ⠀]+$/u, '') : line)
  }
  return lines.join('\n') + '\n'
}

/** 24-bit ANSI escape codes — `cat file-ansi.txt` in a modern terminal shows the art in color. */
export function toAnsi(f: AsciiFrame, style: StyleSettings): string {
  const bgDefault = style.transparent ? null : hexToRgb(style.background)
  let out = ''
  for (let y = 0; y < f.rows; y++) {
    let lastFg = ''
    let lastBg = ''
    for (let x = 0; x < f.cols; x++) {
      const i = y * f.cols + x
      const o = i * 4
      const fgCode = `\x1b[38;2;${f.fg[o]};${f.fg[o + 1]};${f.fg[o + 2]}m`
      let bgCode = ''
      if (f.bg && f.bg[o + 3] > 0) {
        const a = f.bg[o + 3] / 255
        const base = bgDefault ?? [0, 0, 0]
        const r = Math.round(base[0] + (f.bg[o] - base[0]) * a)
        const g = Math.round(base[1] + (f.bg[o + 1] - base[1]) * a)
        const b = Math.round(base[2] + (f.bg[o + 2] - base[2]) * a)
        bgCode = `\x1b[48;2;${r};${g};${b}m`
      } else if (bgDefault) {
        bgCode = `\x1b[48;2;${bgDefault[0]};${bgDefault[1]};${bgDefault[2]}m`
      } else {
        bgCode = '\x1b[49m'
      }
      if (bgCode !== lastBg) {
        out += bgCode
        lastBg = bgCode
      }
      const ch = charAt(f, i)
      if (ch !== ' ' && fgCode !== lastFg) {
        out += fgCode
        lastFg = fgCode
      }
      out += ch
    }
    out += '\x1b[0m\n'
  }
  return out
}

/** Self-contained HTML page with colored <span> runs. */
export function toHtml(f: AsciiFrame, style: StyleSettings, title: string, cellW: number, cellH: number): string {
  const [br, bgg, bb] = hexToRgb(style.background)
  const bodyBg = style.transparent ? 'transparent' : hex2(br, bgg, bb)
  const rows: string[] = []
  for (let y = 0; y < f.rows; y++) {
    let line = ''
    let runStyle = ''
    let run = ''
    const flush = () => {
      if (!run) return
      line += runStyle ? `<span style="${runStyle}">${escapeXml(run)}</span>` : escapeXml(run)
      run = ''
    }
    for (let x = 0; x < f.cols; x++) {
      const i = y * f.cols + x
      const o = i * 4
      const ch = charAt(f, i)
      let st = ''
      if (f.bg && f.bg[o + 3] > 0) st += `background:rgba(${f.bg[o]},${f.bg[o + 1]},${f.bg[o + 2]},${(f.bg[o + 3] / 255).toFixed(3)});`
      if (ch !== ' ') {
        st += `color:${hex2(f.fg[o], f.fg[o + 1], f.fg[o + 2])};`
        if (f.fg[o + 3] < 255) st += `opacity:${(f.fg[o + 3] / 255).toFixed(3)};`
      } else if (!st && !runStyle.includes('background')) {
        // Plain spaces can join any run without a background.
        run += ch
        continue
      }
      if (st !== runStyle) {
        flush()
        runStyle = st
      }
      run += ch
    }
    flush()
    rows.push(line)
  }
  const pad = style.padding
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)}</title>
<style>
html,body{margin:0;background:${bodyBg}}
body{min-height:100vh;display:grid;place-items:center}
pre{margin:0;padding:${(pad * cellH).toFixed(1)}px ${(pad * cellW).toFixed(1)}px;font-family:${FONT_STACK.replace(/"/g, "'")};font-size:${style.fontSize}px;line-height:${cellH.toFixed(3)}px;letter-spacing:${style.letterSpacing}px;font-weight:${style.weight};font-variant-ligatures:none}
pre span{display:inline-block;height:${cellH.toFixed(3)}px;vertical-align:top}
</style>
</head>
<body>
<pre>${rows.join('\n')}</pre>
</body>
</html>
`
}
