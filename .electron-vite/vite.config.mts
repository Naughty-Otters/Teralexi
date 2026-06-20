import { join } from 'path'
import { defineConfig } from 'vite'
import vuePlugin from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import ui from '@nuxt/ui/vite'
import viteIkarosTools from './plugin/vite-ikaros-tools'
import { getConfig } from './utils'

function resolve(dir: string) {
  return join(__dirname, '..', dir)
}
const config = getConfig()

const root = resolve('src/renderer')

export default defineConfig({
  mode: config && config.NODE_ENV,
  root,
  define: {
    __CONFIG__: config,
    __ISWEB__: Number(config && config.target),
  },
  resolve: {
    alias: {
      '@renderer': root,
      '@store': join(root, '/store/modules'),
      '@main': resolve('src/main'),
      '@logging': resolve('src/logging'),
      '@shared': resolve('src/shared'),
      '@openfde-ai/vue': resolve('src/openfde-ai/vue.ts'),
      '@openfde-ai/mcp': resolve('src/openfde-ai/mcp.ts'),
      '@openfde-ai': resolve('src/openfde-ai/renderer.ts'),
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
  },
  server: {
    watch: {
      // Avoid HMR on DB/logs/shiki churn; reduces @vitejs/plugin-vue early HMR races.
      ignored: [
        '**/.git/**',
        '**/.openfde/**',
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
