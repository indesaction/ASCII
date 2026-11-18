import { useApp } from '../state/store'
import { freezeLive, openFile, startCamera } from './sources'

export function pickFile(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*,video/*,.svg,.json,application/json'
  input.onchange = () => {
    const f = input.files?.[0]
    if (f) void openFile(f)
  }
  input.click()
}

/** Start the camera, or freeze the current frame if it's already running. */
export async function toggleCamera(facing: 'user' | 'environment' = 'user'): Promise<void> {
  const s = useApp.getState()
  if (s.source?.kind === 'camera') {
    freezeLive()
    return
  }
  try {
    await startCamera(facing)
    s.setTab('shape')
  } catch (err) {
    s.toast((err as Error).message || 'Camera permission was denied', 'error')
  }
}
