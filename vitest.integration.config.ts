import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'vitest/config'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue(), vueJsx()],
  resolve: {
    alias: {
      '@config': resolve(rootDir, 'config'),
      '@test-paths': resolve(rootDir, 'config/test-path-helpers.ts'),
      '@renderer': resolve(rootDir, 'src/renderer'),
      '@main': resolve(rootDir, 'src/main'),
      '@store': resolve(rootDir, 'src/renderer/store/modules'),
      '@ipcManager': resolve(rootDir, 'src/ipc'),
      '@shared': resolve(rootDir, 'src/shared'),
      '@logging': resolve(rootDir, 'src/logging'),
      '@teralexi-ai/vue': resolve(rootDir, 'src/teralexi-ai/vue.ts'),
      '@teralexi-ai/mcp': resolve(rootDir, 'src/teralexi-ai/mcp.ts'),
      '@teralexi-ai/llm-adapter': resolve(
        rootDir,
        'src/teralexi-ai/llm-adapter.ts',
      ),
      '@teralexi-ai': resolve(rootDir, 'src/teralexi-ai/index.ts'),
      '@test': resolve(rootDir, 'src/test'),
      '@toolSet': resolve(rootDir, 'toolSet'),
      '@skills': resolve(rootDir, 'skills'),
      '@teralexi/skill-sdk': resolve(rootDir, 'skill-sdk'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    passWithNoTests: true,
    include: ['src/**/*.ui.integration.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'build/**'],
    setupFiles: ['./vitest.setup.ts', './src/test/setup/integration.setup.ts'],
    testTimeout: 15_000,
    restoreMocks: true,
    clearMocks: true,
  },
})
