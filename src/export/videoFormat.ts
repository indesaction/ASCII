/** Best MediaRecorder container this browser can produce (MP4 preferred). */
export function videoFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates: [string, string][] = [
    ['video/mp4;codecs=avc1.640028', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
  ]
  for (const [mime, ext] of candidates) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext }
  return null
}
