/**
 * Vite manual chunk splitter for the Electron renderer bundle.
 *
 * Disabled for Electron: even targeted splits (monaco/xterm/shiki) tend to pull
 * Vite's shared preload/runtime into a lazy chunk, forcing the entry module to
 * import multi-MB files before the app can boot on file://.
 */
export function rendererManualChunks(_id: string): string | undefined {
  return undefined
}
