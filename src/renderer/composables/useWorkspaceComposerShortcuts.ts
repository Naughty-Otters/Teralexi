import { computed } from 'vue'

/** Clear workspace (composer message box only — see RichMessageComposer Escape handler). */
export const WORKSPACE_CLEAR_SHORTCUT = 'escape'

/** Open / change workspace folder. */
export const WORKSPACE_CHANGE_SHORTCUT = 'meta_shift_o'

export function useWorkspaceComposerShortcuts() {
  const { getKbdKey } = useKbd()

  function formatShortcutLabel(shortcut: string): string {
    return shortcut
      .toLowerCase()
      .split('_')
      .map((part) => {
        const mapped = getKbdKey(part)
        if (mapped?.trim()) return mapped
        return part.length === 1 ? part.toUpperCase() : part
      })
      .join('')
  }

  const clearShortcutLabel = computed(() =>
    formatShortcutLabel(WORKSPACE_CLEAR_SHORTCUT),
  )
  const changeShortcutLabel = computed(() =>
    formatShortcutLabel(WORKSPACE_CHANGE_SHORTCUT),
  )

  return {
    clearShortcutLabel,
    changeShortcutLabel,
    formatShortcutLabel,
  }
}
