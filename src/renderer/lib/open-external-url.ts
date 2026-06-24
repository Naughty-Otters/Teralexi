/** Open a URL in the system browser (Electron shell bridge). */
export function openExternalUrl(url: string): void {
  const trimmed = url.trim()
  if (!trimmed) return
  const shell = (window as Window & { shell?: { openExternal: (u: string) => void } })
    .shell
  shell?.openExternal(trimmed)
}
