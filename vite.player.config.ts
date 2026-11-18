import { defineConfig } from 'vite'

// Builds the standalone player that gets inlined into "web embed" exports.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'src/generated',
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
    lib: {
      entry: 'src/player/standalone.ts',
      formats: ['iife'],
      name: 'AsciiAtelierPlayer',
      fileName: () => 'player.js',
    },
  },
})
