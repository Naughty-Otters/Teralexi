import type { Plugin } from 'vite'

/**
 * Electron loads the renderer via file://. Vite emits tags that break there:
 * - crossorigin → CORS failures (no ACAO headers on file://)
 * - modulepreload → unreliable prefetch on file://; entry should load via import graph
 */
export function rendererElectronCompatPlugin(): Plugin {
  return {
    name: 'renderer-electron-compat',
    transformIndexHtml(html) {
      return html
        .replace(/ crossorigin/g, '')
        .replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
    },
  }
}
