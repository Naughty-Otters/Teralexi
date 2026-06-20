import { useAppIsDark } from './appColorMode'

export function useTheme() {
  const isDark = useAppIsDark()
  function toggle() {
    isDark.value = !isDark.value
  }
  return { isDark, toggle }
}
