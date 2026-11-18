import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { studio } from '../app/studio'
import { cmykLabel, hexToRgb, rgbToCmyk, rgbToHex, type CmykOptions } from '../engine/color'
import { cellMetrics } from '../engine/convert'
import { isBlank } from '../engine/types'
import { downloadBlob, fileBase, shareBlob, snapshot } from '../export/common'
import { DEFAULT_PDF, PAGE_SIZES, type PdfOptions, type PageSize } from '../export/pdfOptions'
import { canvasToBlob, isIOS, maxCanvasArea, renderStillCanvas } from '../export/raster'
import { videoFormat } from '../export/videoFormat'
import { useApp } from '../state/store'
import { Hint, Section, Segmented, Select, Slider, Toggle } from './controls'
import { Button, IconButton } from './ds'
import { I } from './icons'

type Fmt = 'png' | 'svg' | 'pdf' | 'gif' | 'video' | 'embed' | 'txt' | 'html' | 'ansi' | 'project'

const FORMATS: { id: Fmt; name: string; tag: string; desc: string }[] = [
  { id: 'png', name: 'PNG', tag: 'Image', desc: 'High-resolution raster, optional transparency' },
  { id: 'svg', name: 'SVG', tag: 'Vector', desc: 'Outlined glyphs or live text, colors grouped' },
  { id: 'pdf', name: 'PDF', tag: 'CMYK', desc: 'Print-ready vector with bleed and crop marks' },
  { id: 'gif', name: 'GIF', tag: 'Motion', desc: 'One seamless loop of the animation' },
  { id: 'video', name: 'Video', tag: 'Motion', desc: 'MP4 or WebM, recorded in real time' },
  { id: 'embed', name: 'Web embed', tag: 'Live', desc: 'One HTML file that plays anywhere' },
  { id: 'txt', name: 'Text', tag: '.txt', desc: 'Plain characters for chats, code and READMEs' },
  { id: 'html', name: 'HTML', tag: 'Color', desc: 'Colored <pre> page' },
  { id: 'ansi', name: 'ANSI', tag: 'Terminal', desc: '24-bit color escape codes for terminals' },
  { id: 'project', name: 'Project', tag: '.json', desc: 'Every layer, setting and glyph — reopen later' },
]

const GROUPS: { name: string; ids: Fmt[] }[] = [
  { name: 'Still', ids: ['png', 'svg', 'pdf'] },
  { name: 'Motion', ids: ['gif', 'video', 'embed'] },
  { name: 'Text', ids: ['txt', 'html', 'ansi'] },
  { name: 'Archive', ids: ['project'] },
]

const COPYABLE: Fmt[] = ['png', 'txt', 'html', 'ansi', 'svg']

function topColors(limit = 6): string[] {
  const f = studio.frame
  if (!f) return []
  const counts = new Map<number, number>()
  for (let i = 0; i < f.cols * f.rows; i++) {
    if (isBlank(f.chars[i])) continue
    const k = (f.fg[i * 4] << 16) | (f.fg[i * 4 + 1] << 8) | f.fg[i * 4 + 2]
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => rgbToHex((k >> 16) & 255, (k >> 8) & 255, k & 255))
}

function CmykSwatches({ colors, opts }: { colors: string[]; opts: CmykOptions }) {
  return (
    <div className="cmyk-list">
      {colors.map((c, i) => {
        const [r, g, b] = hexToRgb(c)
        return (
          <div key={i} className="cmyk-row">
            <span className="cmyk-sw" style={{ background: c }} />
            <code>{c.toUpperCase()}</code>
            <code className="cmyk-v">{cmykLabel(rgbToCmyk(r, g, b, opts))}</code>
          </div>
        )
      })}
    </div>
  )
}

export function ExportSheet() {
  const open = useApp((s) => s.ui.exportOpen)
  const setUi = useApp((s) => s.setUi)
  const style = useApp((s) => s.style)
  const motion = useApp((s) => s.motion)
  const interactionMode = useApp((s) => s.interaction.mode)
  const stats = useApp((s) => s.stats)
  const [fmt, setFmt] = useState<Fmt>('png')
  const [png, setPng] = useState({ scale: 3, transparent: false, animationFrame: false })
  const [svg, setSvg] = useState({ outlines: true, background: true })
  const [pdf, setPdf] = useState<PdfOptions>(DEFAULT_PDF)
  const [gif, setGif] = useState({ fps: 20, scale: 1 })
  const [video, setVideo] = useState({ fps: 30, scale: 2, loops: 2 })
  const [embedFont, setEmbedFont] = useState(true)
  const [trim, setTrim] = useState(true)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setUi({ exportOpen: false })
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setUi])

  const vf = useMemo(() => (open ? videoFormat() : null), [open])

  if (!open) return null

  const live = studio.hasLiveLayers()

  const colors = fmt === 'pdf' ? topColors() : []
  const { w: cw, h: ch } = cellMetrics(style)
  const artW = (stats.cols + 2 * style.padding) * cw
  const artH = (stats.rows + 2 * style.padding) * ch
  const maxScale = Math.sqrt(maxCanvasArea() / Math.max(1, artW * artH))
  const pngScale = Math.min(png.scale, maxScale)
  const animated = motion.animation !== 'none'
  const loopSec = motion.duration / Math.max(0.05, motion.speed)

  const run = async (action: 'download' | 'share' | 'copy') => {
    const s = useApp.getState()
    const base = fileBase(s.title)
    let blob: Blob | null = null
    let name = base
    let note = ''
    try {
      snapshot()
      if (fmt === 'svg' || fmt === 'pdf' || fmt === 'embed' || fmt === 'png') {
        useApp.setState({ busy: { label: fmt === 'pdf' ? 'Building CMYK PDF' : 'Exporting', progress: -1 } })
        await new Promise((r) => setTimeout(r, 30))
      }
      switch (fmt) {
        case 'png': {
          blob = await canvasToBlob(renderStillCanvas({ ...png, scale: pngScale }))
          name += '.png'
          break
        }
        case 'svg': {
          const { exportSvg } = await import('../export/svg')
          const r = await exportSvg({ ...svg, cmyk: pdf.cmyk })
          blob = r.blob
          name += '.svg'
          if (r.traced) note = ` · ${r.traced} glyphs auto-traced`
          break
        }
        case 'pdf': {
          const { exportPdf } = await import('../export/pdf')
          const r = await exportPdf(pdf)
          blob = r.blob
          name += '-cmyk.pdf'
          note = ` · ${r.pageMm[0]}×${r.pageMm[1]} mm${r.traced ? ` · ${r.traced} glyphs auto-traced` : ''}`
          break
        }
        case 'gif': {
          const { exportGif } = await import('../export/motion')
          useApp.setState({ busy: { label: 'Rendering GIF', progress: 0 } })
          blob = await exportGif(gif, (p) => useApp.setState({ busy: { label: 'Rendering GIF', progress: p } }))
          name += '.gif'
          break
        }
        case 'video': {
          const { exportVideo } = await import('../export/motion')
          useApp.setState({ busy: { label: 'Recording video', progress: 0 } })
          const r = await exportVideo(video, (p) => useApp.setState({ busy: { label: 'Recording video', progress: p } }))
          blob = r.blob
          name += '.' + r.ext
          break
        }
        case 'embed': {
          const { exportEmbed } = await import('../export/embed')
          blob = await exportEmbed({ embedFont })
          name += '.html'
          break
        }
        case 'txt': {
          const { toPlainText } = await import('../export/text')
          blob = new Blob([toPlainText(studio.frame!, trim)], { type: 'text/plain;charset=utf-8' })
          name += '.txt'
          break
        }
        case 'html': {
          const { toHtml } = await import('../export/text')
          blob = new Blob([toHtml(studio.frame!, s.style, s.title, cw, ch)], { type: 'text/html;charset=utf-8' })
          name += '-page.html'
          break
        }
        case 'ansi': {
          const { toAnsi } = await import('../export/text')
          blob = new Blob([toAnsi(studio.frame!, s.style)], { type: 'text/plain;charset=utf-8' })
          name += '-ansi.txt'
          break
        }
        case 'project': {
          const { exportProject } = await import('../export/project')
          blob = exportProject()
          name += '.atelier.json'
          break
        }
      }
      if (!blob) return
      if (action === 'copy') {
        if (blob.type.startsWith('image/png') && typeof ClipboardItem !== 'undefined') {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        } else {
          await navigator.clipboard.writeText(await blob.text())
        }
        s.toast('Copied to clipboard', 'success')
      } else if (action === 'share') {
        const ok = await shareBlob(blob, name, s.title)
        if (!ok) await downloadBlob(blob, name)
      } else if (await downloadBlob(blob, name)) {
        s.toast(`Saved ${name}${note}`, 'success')
      }
    } catch (err) {
      console.error(err)
      s.toast((err as Error).message || 'Export failed', 'error')
    } finally {
      useApp.setState({ busy: null })
    }
  }

  const info: Record<Fmt, ReactNode> = {
    png: `${Math.round(artW * pngScale)} × ${Math.round(artH * pngScale)} px`,
    svg: `${Math.round(artW)} × ${Math.round(artH)} units`,
    pdf: pdf.page === 'Fit' ? 'Page fits the artwork' : `${pdf.page} · ${PAGE_SIZES[pdf.page as Exclude<PageSize, 'Fit'>].join(' × ')} mm`,
    gif: animated ? `${Math.max(2, Math.round(loopSec * gif.fps))} frames · ${loopSec.toFixed(1)} s loop` : 'Pick an animation in Motion first',
    video: vf ? `${vf.ext.toUpperCase()} · ${live ? `${video.loops}s live capture` : `${(loopSec * video.loops).toFixed(1)} s`}` : 'Not supported in this browser',
    embed: `${embedFont ? '~95 KB font embedded' : 'Uses system monospace'} · ${interactionMode !== 'off' ? 'interactive' : 'autoplay'}`,
    txt: `${stats.cols} × ${stats.rows} characters`,
    html: 'Standalone page',
    ansi: 'Run cat on the file in a truecolor terminal',
    project: 'Drop the file back in to continue',
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator && (isIOS || /Android/i.test(navigator.userAgent))

  return (
    <div className="sheet-backdrop" onClick={() => setUi({ exportOpen: false })}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Export" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>
            Export <em>the piece</em>
          </h2>
          <IconButton label="Close" icon={<I.Close />} onClick={() => setUi({ exportOpen: false })} />
        </header>
        <div className="sheet-body">
          <nav className="fmt-list" aria-label="Formats">
            {GROUPS.map((g) => (
              <Fragment key={g.name}>
                <span className="fmt-group t-label">{g.name}</span>
                {g.ids.map((id) => {
                  const f = FORMATS.find((x) => x.id === id)!
                  return (
                    <button key={f.id} type="button" className={`fmt ${fmt === f.id ? 'is-on' : ''}`} aria-pressed={fmt === f.id} onClick={() => setFmt(f.id)}>
                      <span className="fmt-name">{f.name}</span>
                      <span className="fmt-tag">{f.tag}</span>
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </nav>
          <div className="fmt-options">
            <p className="fmt-desc">{FORMATS.find((f) => f.id === fmt)?.desc}</p>

            {fmt === 'png' && (
              <Section title="Raster">
                <Segmented
                  label="Scale"
                  value={png.scale}
                  onChange={(scale) => setPng({ ...png, scale })}
                  options={[1, 2, 3, 4, 6].map((v) => ({ value: v, label: `${v}×` }))}
                />
                {png.scale > maxScale && <Hint>Limited to {maxScale.toFixed(1)}× by this device's canvas size.</Hint>}
                <Toggle label="Transparent background" checked={png.transparent} onChange={(transparent) => setPng({ ...png, transparent })} />
                {animated && (
                  <Toggle
                    label="Capture current animation frame"
                    checked={png.animationFrame}
                    onChange={(animationFrame) => setPng({ ...png, animationFrame })}
                  />
                )}
              </Section>
            )}

            {fmt === 'svg' && (
              <Section title="Vector">
                <Segmented
                  value={svg.outlines ? 'o' : 't'}
                  onChange={(v) => setSvg({ ...svg, outlines: v === 'o' })}
                  options={[
                    { value: 'o', label: 'Outlined glyphs' },
                    { value: 't', label: 'Live text' },
                  ]}
                />
                <Hint>
                  {svg.outlines
                    ? 'Every glyph becomes a vector path — opens identically in Illustrator, Figma or a plotter, no font needed.'
                    : 'Editable, searchable text. Smaller file; relies on a monospace font being available.'}
                </Hint>
                <Toggle label="Include background" checked={svg.background} onChange={(background) => setSvg({ ...svg, background })} />
                <Hint>SVG stores sRGB; each color group carries its CMYK values in a data-cmyk attribute. Use PDF for true CMYK.</Hint>
              </Section>
            )}

            {fmt === 'pdf' && (
              <>
                <Section title="Page">
                  <div className="row two">
                    <Select
                      label="Size"
                      value={pdf.page}
                      onChange={(page) => setPdf({ ...pdf, page })}
                      options={(['A5', 'A4', 'A3', 'Letter', 'Tabloid', 'Square', 'Fit'] as PageSize[]).map((p) => ({ value: p, label: p === 'Fit' ? 'Fit artwork' : p }))}
                    />
                    <Select
                      label="Orientation"
                      value={pdf.orientation}
                      onChange={(orientation) => setPdf({ ...pdf, orientation })}
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'portrait', label: 'Portrait' },
                        { value: 'landscape', label: 'Landscape' },
                      ]}
                    />
                  </div>
                  <Slider label="Margin" value={pdf.marginMm} min={0} max={40} step={1} onChange={(marginMm) => setPdf({ ...pdf, marginMm })} format={(v) => `${v} mm`} />
                  <Segmented
                    size="sm"
                    label="Bleed"
                    value={pdf.bleedMm}
                    onChange={(bleedMm) => setPdf({ ...pdf, bleedMm })}
                    options={[0, 3, 5].map((v) => ({ value: v, label: `${v} mm` }))}
                  />
                  <Segmented
                    size="sm"
                    label="Background"
                    value={pdf.background}
                    onChange={(background) => setPdf({ ...pdf, background })}
                    options={[
                      { value: 'none', label: 'Paper' },
                      { value: 'art', label: 'Art only' },
                      { value: 'bleed', label: 'Full bleed' },
                    ]}
                  />
                  <Toggle label="Crop marks" checked={pdf.cropMarks} onChange={(cropMarks) => setPdf({ ...pdf, cropMarks })} />
                  <Toggle label="Caption" hint="Title and grid size in the bottom margin" checked={pdf.caption} onChange={(caption) => setPdf({ ...pdf, caption })} />
                </Section>
                <Section title="CMYK">
                  <Toggle
                    label="Rich black"
                    hint="Pure black prints as C60 M40 Y40 K100 for deeper solids"
                    checked={pdf.cmyk.richBlack}
                    onChange={(richBlack) => setPdf({ ...pdf, cmyk: { ...pdf.cmyk, richBlack } })}
                  />
                  <Toggle
                    label="Neutral grays on K only"
                    hint="Grays use black ink alone — no color cast, no registration blur"
                    checked={pdf.cmyk.neutralK}
                    onChange={(neutralK) => setPdf({ ...pdf, cmyk: { ...pdf.cmyk, neutralK } })}
                  />
                  <Slider
                    label="Total ink limit"
                    value={pdf.cmyk.inkLimit}
                    min={200}
                    max={400}
                    step={10}
                    onChange={(inkLimit) => setPdf({ ...pdf, cmyk: { ...pdf.cmyk, inkLimit } })}
                    format={(v) => `${v}%`}
                  />
                  <CmykSwatches colors={[style.background, ...colors.filter((c) => c !== style.background)].slice(0, 6)} opts={pdf.cmyk} />
                </Section>
              </>
            )}

            {fmt === 'gif' && (
              <Section title="Animation">
                <Segmented label="Frame rate" value={gif.fps} onChange={(fps) => setGif({ ...gif, fps })} options={[10, 15, 20, 25, 30].map((v) => ({ value: v, label: `${v}` }))} />
                <Slider label="Scale" value={gif.scale} min={0.5} max={2} step={0.25} onChange={(scale) => setGif({ ...gif, scale })} format={(v) => `${v}×`} />
              </Section>
            )}

            {fmt === 'video' && (
              <Section title="Recording">
                <Segmented label="Frame rate" value={video.fps} onChange={(fps) => setVideo({ ...video, fps })} options={[24, 30, 60].map((v) => ({ value: v, label: `${v}` }))} />
                {!live && (
                  <Slider label="Scale" value={video.scale} min={1} max={3} step={0.5} onChange={(scale) => setVideo({ ...video, scale })} format={(v) => `${v}×`} />
                )}
                <Slider
                  label={live ? 'Length' : 'Loops'}
                  value={video.loops}
                  min={1}
                  max={live ? 30 : 6}
                  step={1}
                  onChange={(loops) => setVideo({ ...video, loops })}
                  format={(v) => (live ? `${v}s` : `${v}×`)}
                />
                <Hint>Recording runs in real time — keep this tab visible until it finishes.</Hint>
              </Section>
            )}

            {fmt === 'embed' && (
              <Section title="Embed">
                <Toggle label="Embed the font" hint="Pixel-identical everywhere (+~95 KB)" checked={embedFont} onChange={setEmbedFont} />
                <Hint>
                  A single HTML file with the animation{interactionMode !== 'off' ? ' and your pointer effect' : ''}. Host it, or drop it into an
                  iframe. Respects reduced-motion preferences.
                </Hint>
              </Section>
            )}

            {fmt === 'txt' && (
              <Section title="Text">
                <Toggle label="Trim trailing spaces" checked={trim} onChange={setTrim} />
              </Section>
            )}

            <div className="fmt-info t-meta">{info[fmt]}</div>
            <div className="sheet-actions">
              {COPYABLE.includes(fmt) && (
                <Button variant="ghost" icon={<I.Copy />} onClick={() => void run('copy')}>
                  Copy
                </Button>
              )}
              {canShare && ['png', 'gif', 'video', 'pdf', 'svg'].includes(fmt) && (
                <Button variant="secondary" icon={<I.Share />} onClick={() => void run('share')}>
                  Share
                </Button>
              )}
              <Button
                variant="primary"
                icon={<I.Download />}
                disabled={(fmt === 'gif' && !animated) || (fmt === 'video' && (!vf || (!animated && !live)))}
                onClick={() => void run('download')}
              >
                Download {FORMATS.find((f) => f.id === fmt)?.name}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
