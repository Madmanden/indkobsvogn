import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const swVersion = createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 8)

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sw-version',
      closeBundle() {
        const swPath = resolve(__dirname, 'dist/sw.js')
        const sw = readFileSync(swPath, 'utf-8')
        writeFileSync(swPath, sw.replace(/__CACHE_VERSION__/g, swVersion))
      },
    },
  ],
  define: {
    __SW_VERSION__: JSON.stringify(swVersion),
  },
})
