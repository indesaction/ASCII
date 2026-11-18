import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { blendFor, composeFrame } from '../anim/compose'
import { studio } from '../app/studio'
import { RenderList, createRenderer, fitPixelRatio } from '../render'
import { nextTick, snapshot } from './common'
import { videoFormat } from './videoFormat'

export interface GifOptions {
  fps: number
  scale: number
}

/** One seamless loop of the current animation as an animated GIF. */
export async function exportGif(opts: GifOptions, onProgress: (p: number) => void): Promise<Blob> {
  const { frame, prep, motion } = snapshot()
  if (motion.animation === 'none') throw new Error('Choose an animation in Motion first.')
  const loopSeconds = motion.duration / Math.max(0.05, motion.speed)
  const count = Math.max(2, Math.min(360, Math.round(loopSeconds * opts.fps)))
  const layout = studio.layoutFor(frame, 1)
  layout.pixelRatio = fitPixelRatio(layout, opts.scale, 2400, 3_500_000)

  const canvas = document.createElement('canvas')
  const renderer = createRenderer(canvas, true, true)
  renderer.setLayout(layout)
  const w = canvas.width
  const h = canvas.height
  const read = document.createElement('canvas')
  read.width = w
  read.height = h
  const rctx = read.getContext('2d', { willReadFrequently: true })!
  const list = new RenderList()
  const params = studio.composeParams()
  const bg = studio.backgroundRGBA(true, false)
  const blend = blendFor(params.animation)
  const gif = GIFEncoder()
  const delay = Math.round(1000 / opts.fps)
  try {
    for (let k = 0; k < count; k++) {
      composeFrame(list, frame, prep, (k / count) * motion.duration, params)
      renderer.render(list, bg, blend)
      rctx.clearRect(0, 0, w, h)
      rctx.drawImage(canvas, 0, 0)
      const px = rctx.getImageData(0, 0, w, h).data
      const palette = quantize(px, 256)
      const index = applyPalette(px, palette)
      gif.writeFrame(index, w, h, { palette, delay })
      onProgress((k + 1) / count)
      if (k % 2 === 0) await nextTick()
    }
    gif.finish()
  } finally {
    renderer.dispose()
  }
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' })
}

export interface VideoOptions {
  scale: number
  fps: number
  /** Loops of the animation (or seconds, for live sources). */
  loops: number
}

/** Record the animation (or a live camera/video source) in real time with MediaRecorder. */
export async function exportVideo(opts: VideoOptions, onProgress: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
  const fmt = videoFormat()
  if (!fmt) throw new Error('Video recording is not supported in this browser.')
  const { frame, prep, motion } = snapshot()
  const live = !!studio.video
  if (!live && motion.animation === 'none') throw new Error('Choose an animation (or use a video/camera source) first.')

  let canvas: HTMLCanvasElement
  let renderOffscreen: ((elapsed: number) => void) | null = null
  let cleanup = () => {}
  const total = live ? opts.loops * 1 : (motion.duration / Math.max(0.05, motion.speed)) * opts.loops

  if (live) {
    if (!studio.canvas) throw new Error('Preview is not ready.')
    canvas = studio.canvas
  } else {
    canvas = document.createElement('canvas')
    Object.assign(canvas.style, { position: 'fixed', left: '-10000px', top: '0', width: '10px', height: '10px', pointerEvents: 'none' })
    document.body.appendChild(canvas)
    const renderer = createRenderer(canvas, true, true)
    const layout = studio.layoutFor(frame, 1)
    layout.pixelRatio = fitPixelRatio(layout, opts.scale, 3840, 8_300_000)
    // Most encoders want even dimensions.
    renderer.setLayout(layout)
    if (canvas.width % 2) canvas.width += 1
    if (canvas.height % 2) canvas.height += 1
    const list = new RenderList()
    const params = studio.composeParams()
    const bg = studio.backgroundRGBA(true, false)
    const blend = blendFor(params.animation)
    renderOffscreen = (elapsed) => {
      composeFrame(list, frame, prep, elapsed * motion.speed, params)
      renderer.render(list, bg, blend)
    }
    renderOffscreen(0)
    cleanup = () => {
      renderer.dispose()
      canvas.remove()
    }
  }

  const stream = canvas.captureStream(opts.fps)
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 10_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()))
  rec.start(250)
  const t0 = performance.now()
  await new Promise<void>((resolve) => {
    const step = () => {
      const elapsed = (performance.now() - t0) / 1000
      renderOffscreen?.(Math.min(elapsed, total))
      onProgress(Math.min(1, elapsed / total))
      if (elapsed >= total) resolve()
      else requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  rec.stop()
  await done
  for (const t of stream.getTracks()) t.stop()
  cleanup()
  return { blob: new Blob(chunks, { type: fmt.mime.split(';')[0] }), ext: fmt.ext }
}
