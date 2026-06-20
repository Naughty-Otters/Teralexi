import { useDark } from '@vueuse/core'
import type { WritableComputedRef } from 'vue'

let isDarkRef: WritableComputedRef<boolean> | null = null

/** One shared color-mode watcher — extra `useDark()` calls can break `html` theme classes. */
export function initAppColorMode(): WritableComputedRef<boolean> {
  if (!isDarkRef) {
    isDarkRef = useDark({
      selector: 'html',
      attribute: 'class',
      valueDark: 'dark',
      valueLight: '',
    })
  }
  return isDarkRef
}

export function useAppIsDark(): WritableComputedRef<boolean> {
  return initAppColorMode()
}
