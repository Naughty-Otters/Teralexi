import { join } from 'path'
import { defineConfig } from 'vite'
import vuePlugin from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import ui from '@nuxt/ui/vite'
import viteIkarosTools from './plugin/vite-ikaros-tools'
import { getConfig } from './utils'
import { rendererManualChunks } from './renderer-manual-chunks'

function resolve(dir: string) {
  return join(__dirname, '..', dir)
}
const root = resolve('src/renderer')

const config = getConfig() ?? {}

export default defineConfig({
  mode: config && config.NODE_ENV,
  root,
  define: {
    __CONFIG__: config,
    '__CONFIG__.BASE_API': JSON.stringify(config.BASE_API ?? ''),
    '__CONFIG__.NODE_ENV': JSON.stringify(config.NODE_ENV ?? ''),
    __ISWEB__: Number(config && config.target),
  },
  resolve: {
    alias: {
      '@renderer': root,
      '@store': join(root, '/store/modules'),
      '@main': resolve('src/main'),
      '@logging': resolve('src/logging'),
      '@shared': resolve('src/shared'),
      '@teralexi-ai/vue': resolve('src/teralexi-ai/vue.ts'),
      '@teralexi-ai/mcp': resolve('src/teralexi-ai/mcp.ts'),
      '@teralexi-ai': resolve('src/teralexi-ai/renderer.ts'),
    },
  },

  base: './',
  build: {
    outDir:
      config && config.target
        ? resolve('dist/web')
        : resolve('dist/electron/renderer'),
    emptyOutDir: true,
    target: 'esnext',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: rendererManualChunks,
      },
    },
  },
  server: {
    watch: {
      // Avoid HMR on DB/logs/shiki churn; reduces @vitejs/plugin-vue early HMR races.
      ignored: [
        '**/.git/**',
        '**/.teralexi/**',
        '**/dist/**',
        '**/*.db',
        '**/*.db-wal',
        '**/*.db-shm',
      ],
    },
  },
  plugins: [ui({ colorMode: false }), vueJsx(), vuePlugin(), viteIkarosTools()],
  optimizeDeps: {
    include: ['shiki', 'monaco-editor'],
  },
})
