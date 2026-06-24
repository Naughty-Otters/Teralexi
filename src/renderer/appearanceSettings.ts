import { ref } from 'vue'
import {
  APP_UI_APPEARANCE_KEY,
  APPEARANCE_SETTINGS_PROP_KEYS,
  DEFAULT_APPEARANCE_SETTINGS,
  parseAppearanceSettings,
  type AppearanceSettings,
  type AppAppearance,
} from '@shared/ui/appearance-settings'
import {
  getSystemConfigValues,
  setSystemConfigValue,
} from '@store/agent/config'

export const appAppearance = ref<AppAppearance>(
  DEFAULT_APPEARANCE_SETTINGS.appearance,
)

export function isGlassAppearance(): boolean {
  return appAppearance.value === 'glass'
}

export function applyAppearanceSettings(settings: AppearanceSettings): void {
  appAppearance.value = settings.appearance
  document.documentElement.classList.toggle('glass', settings.appearance === 'glass')
}

async function syncNativeWindowGlass(appearance: AppAppearance): Promise<void> {
  const ipc = window.ipcRendererChannel?.SetAppWindowAppearance
  if (!ipc?.invoke) return
  await ipc.invoke({ appearance })
}

export async function loadAppearanceSettings(): Promise<AppearanceSettings> {
  const values = await getSystemConfigValues([...APPEARANCE_SETTINGS_PROP_KEYS])
  const parsed = parseAppearanceSettings(values)
  applyAppearanceSettings(parsed)
  await syncNativeWindowGlass(parsed.appearance)
  return parsed
}

export async function saveAppearanceSettings(
  settings: AppearanceSettings,
): Promise<AppearanceSettings> {
  const next: AppearanceSettings = {
    appearance: settings.appearance === 'glass' ? 'glass' : 'solid',
  }
  await setSystemConfigValue(APP_UI_APPEARANCE_KEY, next.appearance)
  applyAppearanceSettings(next)
  await syncNativeWindowGlass(next.appearance)
  return next
}
