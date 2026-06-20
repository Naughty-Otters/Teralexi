/** Desktop app auto-update phases (electron-updater). */
export type AppUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface AppUpdateMessage {
  phase: AppUpdatePhase
  currentVersion: string
  newVersion?: string
  releaseNotes?: string
  /** Download progress 0–100 when phase is `downloading`. */
  percent?: number
  error?: string
}

export interface AppVersionInfo {
  version: string
  isPackaged: boolean
}

/** Placeholder GitHub repo for electron-builder publish until official repo exists. */
export const RELEASE_GITHUB_OWNER = 'openfde-app'
export const RELEASE_GITHUB_REPO = 'openfde'
