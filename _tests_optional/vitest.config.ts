import { defineConfig } from 'vitest/config'
import path from 'node:path'
export default defineConfig({
  root: path.resolve(__dirname, '..'),
  css: { postcss: { plugins: [] } },
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  test: { include: ['.test/**/*.test.ts'], environment: 'node', testTimeout: 60000, hookTimeout: 60000, fileParallelism: false },
})
