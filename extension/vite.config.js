import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { copyFileSync, rmSync } from 'node:fs'

export default defineConfig(({ mode }) => ({
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, '../dist-extension'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'sidepanel.html') }
  },
  plugins: [
    react(),
    { name: 'pod-bridge-manifest-mode', closeBundle() {
      const output = resolve(__dirname, '../dist-extension')
      if (mode === 'development') copyFileSync(resolve(__dirname, 'public/manifest.dev.json'), resolve(output, 'manifest.json'))
      rmSync(resolve(output, 'manifest.dev.json'), { force: true })
    } }
  ]
}))
