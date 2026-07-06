type OpenSettingsAboutHandler = () => void
type SwitchSettingsTabHandler = (tab: string) => void

let openSettingsAboutHandler: OpenSettingsAboutHandler | null = null
let switchSettingsTabHandler: SwitchSettingsTabHandler | null = null

export function registerAppUpdateAboutHandler(
  handler: OpenSettingsAboutHandler | null,
): void {
  openSettingsAboutHandler = handler
}

export function registerSettingsTabHandler(
  handler: SwitchSettingsTabHandler | null,
): void {
  switchSettingsTabHandler = handler
}

/** Opens Settings → About (used by the title-bar update flag). */
export function openAppUpdateAbout(): void {
  if (switchSettingsTabHandler) {
    switchSettingsTabHandler('about')
  } else {
    sessionStorage.setItem('teralexi.settingsTab', 'about')
  }
  openSettingsAboutHandler?.()
}
