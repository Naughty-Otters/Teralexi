import { join } from 'path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import vuePlugin from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import ui from '@nuxt/ui/vite'
import viteIkarosTools from './plugin/vite-ikaros-tools'
import { getConfig } from './utils'
import { rendererIconBundlePlugin } from './renderer-icon-bundle'
import { rendererManualChunks } from './renderer-manual-chunks'
import { rendererElectronCompatPlugin } from './renderer-electron-compat'
import { rendererNuxtUiImportsPlugin } from './renderer-nuxt-ui-imports'

function resolve(dir: string) {
  return join(__dirname, '..', dir)
}
const root = resolve('src/renderer')
const repoRoot = resolve('.')

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
    dedupe: ['vue', 'vue-router'],
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
    // file:// cannot load crossorigin/modulepreload hints reliably in Electron.
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks: rendererManualChunks,
      },
    },
  },
  server: {
    fs: {
      // Vite root is src/renderer; Nuxt UI / deps live in the repo node_modules.
      // Explicit allowlist avoids intermittent /@fs 403s for those packages.
      allow: [searchForWorkspaceRoot(process.cwd()), repoRoot, root],
    },
    warmup: {
      clientFiles: [
        join(root, 'main.ts'),
        join(root, 'App.vue'),
        join(root, 'router/index.ts'),
      ],
    },
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
  plugins: [
    rendererElectronCompatPlugin(),
    // Must run before @nuxt/ui so `#imports` is virtual (not an @fs absolute stub).
    rendererNuxtUiImportsPlugin(),
    rendererIconBundlePlugin(root, resolve('.')),
    ui({
      colorMode: false,
      icon: { mode: 'svg' },
      router: true,
    }),
    vueJsx(),
    vuePlugin(),
    viteIkarosTools(),
  ],
  optimizeDeps: {
    include: [
      'shiki',
      'monaco-editor',
      'vue-router',
      'vue',
      '@unhead/vue',
      'hookable',
    ],
  },
})
