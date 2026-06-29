import { OPENFDE_PLATFORM_PATHS } from './openfde-platform-api'

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

/** Default stable-channel path under BASE_API for authenticated desktop updates. */
export const OPENFDE_DESKTOP_RELEASES_DEFAULT_PATH =
  OPENFDE_PLATFORM_PATHS.desktopReleases

/** @deprecated Releases are served via authenticated API + S3, not public GitHub Releases. */
export const RELEASE_GITHUB_OWNER = 'Naughty-Otters'
/** @deprecated Releases are served via authenticated API + S3, not public GitHub Releases. */
export const RELEASE_GITHUB_REPO = 'OpenFDE'
