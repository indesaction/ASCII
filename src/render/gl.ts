import { FULL_BLOCK } from '../engine/glyphs'
import { type Atlas, atlasKey, buildAtlas } from './atlas'
import { type Blend, GEOM_STRIDE, type Layout, type RGBA, type RenderList, type Renderer, glyphs, layoutSize } from './list'

const VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aGeom;
layout(location=2) in float aGlyph;
layout(location=3) in vec4 aColor;
uniform vec2 uCell;
uniform float uPad;
uniform vec2 uBox;
uniform vec2 uView;
uniform vec2 uAtlas;
uniform float uPerRow;
uniform float uFull;
out vec2 vUv;
out vec4 vColor;
void main() {
  vec2 center = (aGeom.xy + uPad + 0.5) * uCell;
  // Full blocks (cell tints, pixel mode) only need a cell-sized quad: far less overdraw.
  bool full = abs(aGlyph - uFull) < 0.5;
  vec2 box = full ? uCell + 1.0 : uBox;
  vec2 pos;
  if (aGeom.z == 1.0 && aGeom.w == 0.0) {
    vec2 tl = floor(center - box * 0.5 + 0.5);
    pos = tl + (aCorner + 0.5) * box;
  } else {
    float c = cos(aGeom.w);
    float s = sin(aGeom.w);
    vec2 p = aCorner * box * aGeom.z;
    pos = center + vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  }
  vec2 clip = pos / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float gi = aGlyph;
  vec2 slot = vec2(mod(gi, uPerRow), floor(gi / uPerRow));
  vUv = (slot * uBox + (full ? vec2(0.5) : aCorner + 0.5) * uBox) / uAtlas;
  vColor = aColor;
}`

const FS = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec4 vColor;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
  float a = texture(uTex, vUv).a * vColor.a;
  outColor = vec4(vColor.rgb * a, a);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s)
    gl.deleteShader(s)
    throw new Error('Shader compile failed: ' + log)
  }
  return s
}

export class GLRenderer implements Renderer {
  readonly kind = 'webgl2' as const
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  private gl: WebGL2RenderingContext
  private program!: WebGLProgram
  private vao!: WebGLVertexArrayObject
  private geomBuf!: WebGLBuffer
  private colorBuf!: WebGLBuffer
  private tex!: WebGLTexture
  private u: Record<string, WebGLUniformLocation | null> = {}
  private atlas: Atlas | null = null
  private atlasVersion = -1
  private layout: Layout | null = null
  private lost = false
  readonly maxDim: number

  private constructor(canvas: HTMLCanvasElement | OffscreenCanvas, gl: WebGL2RenderingContext) {
    this.canvas = canvas
    this.gl = gl
    this.maxDim = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      (gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array)[0],
      8192,
    )
    this.init()
    if ('addEventListener' in canvas) {
      ;(canvas as HTMLCanvasElement).addEventListener('webglcontextlost', (e) => {
        e.preventDefault()
        this.lost = true
      })
      ;(canvas as HTMLCanvasElement).addEventListener('webglcontextrestored', () => {
        this.lost = false
        this.atlas = null
        this.atlasVersion = -1
        this.init()
      })
    }
  }

  private static support: boolean | null = null

  /** Probe WebGL2 + our shaders on a throwaway canvas, so a failure never poisons a real canvas. */
  static supported(): boolean {
    if (GLRenderer.support !== null) return GLRenderer.support
    try {
      const force = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('renderer') : null
      if (force === '2d') throw new Error('Canvas 2D requested')
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 4) : document.createElement('canvas')
      // Software GL (VMs, blocklisted GPUs) is slower than Canvas 2D for this workload.
      const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: force !== 'gl' }) as WebGL2RenderingContext | null
      if (!gl) throw new Error('no hardware-accelerated WebGL2')
      const info = gl.getExtension('WEBGL_debug_renderer_info')
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
      if (force !== 'gl' && /swiftshader|llvmpipe|softpipe|basic render|software/i.test(name)) {
        throw new Error(`software rasterizer (${name})`)
      }
      const r = new GLRenderer(c, gl)
      r.dispose()
      GLRenderer.support = true
    } catch (err) {
      console.info('WebGL2 renderer unavailable, using Canvas 2D:', (err as Error).message)
      GLRenderer.support = false
    }
    return GLRenderer.support
  }

  static create(canvas: HTMLCanvasElement | OffscreenCanvas, preserve = false): GLRenderer | null {
    if (!GLRenderer.supported()) return null
    try {
      const gl = canvas.getContext('webgl2', {
        antialias: false,
        alpha: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: preserve,
        powerPreference: 'high-performance',
      }) as WebGL2RenderingContext | null
      if (!gl) return null
      return new GLRenderer(canvas, gl)
    } catch {
      return null
    }
  }

  private init(): void {
    const gl = this.gl
    const p = gl.createProgram()!
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS))
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p))
    this.program = p
    for (const name of ['uCell', 'uPad', 'uBox', 'uView', 'uAtlas', 'uPerRow', 'uTex', 'uFull']) {
      this.u[name] = gl.getUniformLocation(p, name)
    }
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)

    const quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.geomBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geomBuf)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, GEOM_STRIDE * 4, 0)
    gl.vertexAttribDivisor(1, 1)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, GEOM_STRIDE * 4, 16)
    gl.vertexAttribDivisor(2, 1)

    this.colorBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf)
    gl.enableVertexAttribArray(3)
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 0, 0)
    gl.vertexAttribDivisor(3, 1)
    gl.bindVertexArray(null)

    this.tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  setLayout(l: Layout): void {
    this.layout = l
    const { width, height } = layoutSize(l)
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
  }

  private ensureAtlas(): void {
    const l = this.layout!
    const pr = l.pixelRatio
    const fontPx = l.fontSize * pr
    const key = atlasKey(fontPx, l.weight, l.cellW * pr, l.cellH * pr)
    if (this.atlas && this.atlas.key === key && this.atlasVersion === glyphs.version) return
    this.atlas = buildAtlas(glyphs.strings, glyphs.codes, fontPx, l.weight, l.cellW * pr, l.cellH * pr, this.maxDim)
    this.atlasVersion = glyphs.version
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas as TexImageSource)
  }

  render(list: RenderList, bg: RGBA, blend: Blend = 'normal'): void {
    if (this.lost || !this.layout) return
    const gl = this.gl
    const l = this.layout
    const full = glyphs.index(FULL_BLOCK)
    this.ensureAtlas()
    const atlas = this.atlas!
    const pr = l.pixelRatio
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    const a = bg[3] / 255
    gl.clearColor((bg[0] / 255) * a, (bg[1] / 255) * a, (bg[2] / 255) * a, a)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (list.count === 0) return

    gl.useProgram(this.program)
    gl.uniform2f(this.u.uCell, l.cellW * pr, l.cellH * pr)
    gl.uniform1f(this.u.uPad, l.pad)
    gl.uniform2f(this.u.uBox, atlas.boxW, atlas.boxH)
    gl.uniform2f(this.u.uView, this.canvas.width, this.canvas.height)
    gl.uniform2f(this.u.uAtlas, atlas.width, atlas.height)
    gl.uniform1f(this.u.uPerRow, atlas.perRow)
    gl.uniform1f(this.u.uFull, full)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.uniform1i(this.u.uTex, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.geomBuf)
    gl.bufferData(gl.ARRAY_BUFFER, list.geom.subarray(0, list.count * GEOM_STRIDE), gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf)
    gl.bufferData(gl.ARRAY_BUFFER, list.color.subarray(0, list.count * 4), gl.DYNAMIC_DRAW)

    gl.enable(gl.BLEND)
    gl.bindVertexArray(this.vao)
    if (blend === 'add' && list.bgCount > 0) {
      // Background tiles always composite normally; glyphs glow additively.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, list.bgCount)
      gl.blendFunc(gl.ONE, gl.ONE)
      this.drawRange(list.bgCount, list.count - list.bgCount)
    } else {
      gl.blendFunc(gl.ONE, blend === 'add' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, list.count)
    }
    gl.bindVertexArray(null)
  }

  private drawRange(start: number, count: number): void {
    if (count <= 0) return
    const gl = this.gl
    // Re-point instanced attributes at an offset (WebGL2 has no baseInstance).
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geomBuf)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, GEOM_STRIDE * 4, start * GEOM_STRIDE * 4)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, GEOM_STRIDE * 4, start * GEOM_STRIDE * 4 + 16)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf)
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 0, start * 4)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geomBuf)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, GEOM_STRIDE * 4, 0)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, GEOM_STRIDE * 4, 16)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf)
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 0, 0)
  }

  dispose(): void {
    const ext = this.gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
  }
}
