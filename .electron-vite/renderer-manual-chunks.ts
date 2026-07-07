/**
 * Vite manual chunk splitter for the Electron renderer bundle.
 * Agent store dynamic imports (skills, MCP, assistant-run) split automatically via import().
 */
export function rendererManualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined

  if (
    id.includes('/vue/') ||
    id.includes('/@vue/') ||
    id.includes('/pinia/') ||
    id.includes('/vue-router/')
  ) {
    return 'vue-vendor'
  }

  if (id.includes('/@nuxt/ui') || id.includes('/@nuxt/')) {
    return 'nuxt-ui'
  }

  if (
    id.includes('/@tiptap/') ||
    id.includes('/prosemirror-') ||
    id.includes('/tiptap/')
  ) {
    return 'tiptap'
  }

  if (id.includes('/xterm/') || id.includes('@xterm/')) {
    return 'xterm'
  }

  if (id.includes('/monaco-editor/') || id.includes('/@monaco-editor/')) {
    return 'monaco'
  }

  if (id.includes('/shiki/') || id.includes('@shikijs/')) {
    return 'shiki'
  }

  if (
    id.includes('/ai/') ||
    id.includes('/@ai-sdk/') ||
    id.includes('/@teralexi-ai/')
  ) {
    return 'ai-sdk'
  }

  return 'vendor'
}
