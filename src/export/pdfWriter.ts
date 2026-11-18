/**
 * Minimal PDF 1.6 writer: indirect objects, Flate-compressed streams, xref.
 * Enough for vector artwork in DeviceCMYK without any heavy dependency.
 */

const enc = new TextEncoder()

export async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  const cs = new CompressionStream('deflate')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(cs)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export class PdfDoc {
  private objects: Uint8Array[] = []

  alloc(): number {
    this.objects.push(new Uint8Array())
    return this.objects.length
  }

  set(num: number, dict: string): void {
    this.objects[num - 1] = enc.encode(`${num} 0 obj\n${dict}\nendobj\n`)
  }

  async setStream(num: number, dict: string, content: string | Uint8Array, compress = true): Promise<void> {
    let data = typeof content === 'string' ? enc.encode(content) : content
    let filter = ''
    if (compress && data.length > 64) {
      const z = await deflate(data)
      if (z) {
        data = z
        filter = ' /Filter /FlateDecode'
      }
    }
    const head = enc.encode(`${num} 0 obj\n<< ${dict} /Length ${data.length}${filter} >>\nstream\n`)
    const tail = enc.encode('\nendstream\nendobj\n')
    const out = new Uint8Array(head.length + data.length + tail.length)
    out.set(head, 0)
    out.set(data, head.length)
    out.set(tail, head.length + data.length)
    this.objects[num - 1] = out
  }

  build(root: number, info: number): Blob {
    const header = new Uint8Array([...enc.encode('%PDF-1.6\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])
    const chunks: Uint8Array[] = [header]
    const offsets: number[] = []
    let pos = header.length
    for (const o of this.objects) {
      offsets.push(pos)
      chunks.push(o)
      pos += o.length
    }
    const n = this.objects.length + 1
    let xref = `xref\n0 ${n}\n0000000000 65535 f \n`
    for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`
    xref += `trailer\n<< /Size ${n} /Root ${root} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`
    chunks.push(enc.encode(xref))
    return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
  }
}

/** Escape a string for a PDF literal (ASCII only). */
export function pdfString(s: string): string {
  const ascii = s.normalize('NFKD').replace(/[^\x20-\x7e]/g, '')
  return '(' + ascii.replace(/[\\()]/g, (c) => '\\' + c) + ')'
}

export function pdfDate(d = new Date()): string {
  const p = (v: number) => String(v).padStart(2, '0')
  return `(D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z)`
}
