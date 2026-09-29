import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, '..'),
  css: { postcss: { plugins: [] } },
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  test: { include: ['.test/**/*.ui.tsx'], environment: 'jsdom', testTimeout: 30000 },
})
