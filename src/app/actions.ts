import { useApp } from '../state/store'
import type { Placement } from './doc'
import { ACCEPT, addCamera, addFiles } from './sources'

/** Open the system file picker and add the chosen files as layers. */
export function pickFiles(where: Placement = 'above'): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = ACCEPT
  input.onchange = () => {
    if (input.files?.length) void addFiles(input.files, where)
  }
  input.click()
}

export async function addCameraLayer(where: Placement = 'above'): Promise<void> {
  try {
    await addCamera('user', where)
  } catch (err) {
    useApp.getState().toast((err as Error).message || 'Camera permission was denied', 'error')
  }
}
