let opener: (() => void) | null = null

export function registerComposerAgentPicker(fn: () => void): void {
  opener = fn
}

export function unregisterComposerAgentPicker(fn: () => void): void {
  if (opener === fn) opener = null
}

export function openComposerAgentPicker(): boolean {
  if (!opener) return false
  opener()
  return true
}
