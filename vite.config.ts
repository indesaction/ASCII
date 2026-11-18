import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** Fill the service worker's precache list with every built file, versioned by content. */
function precache(): Plugin {
  let outDir = 'dist'
  return {
    name: 'atelier-precache',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      const files: string[] = []
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name)
          if (statSync(p).isDirectory()) walk(p)
          else files.push(relative(outDir, p).split('\\').join('/'))
        }
      }
      walk(outDir)
      // Large on-demand decoders (PDF, PSD…) are cached the first time they're used instead.
      const list = files
        .filter((f) => f !== 'sw.js' && !f.endsWith('.txt') && !f.endsWith('.map'))
        .filter((f) => f.startsWith('assets/index-') || statSync(join(outDir, f)).size < 300_000)
        .sort()
      const hash = createHash('sha256')
      for (const f of list) hash.update(f)
      const sw = join(outDir, 'sw.js')
      const src = readFileSync(sw, 'utf8')
        .replace("const VERSION = 'dev'", `const VERSION = '${hash.digest('hex').slice(0, 10)}'`)
        .replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(list.map((f) => './' + f))}`)
      writeFileSync(sw, src)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works from any sub-path (GitHub Pages, etc).
  base: './',
  plugins: [react(), precache()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
})
