export const CLAWHUB_REGISTRY_BASE_URL = 'https://clawhub.ai'

export type ClawHubSkillSearchHit = {
  slug: string
  displayName: string
  summary: string
  version: string
  updatedAt: number
  ownerHandle?: string
  score?: number
}

export type ClawHubSkillSearchResult = {
  results: ClawHubSkillSearchHit[]
}

export type ClawHubSkillModeration = {
  isSuspicious?: boolean
  isMalwareBlocked?: boolean
  verdict?: string
  reasonCodes?: string[]
  summary?: string | null
}

export type ClawHubSkillVersionInfo = {
  version: string
  createdAt?: number
  changelog?: string
}

export type ClawHubSkillDetail = {
  slug: string
  displayName: string
  summary: string
  latestVersion: ClawHubSkillVersionInfo
  moderation?: ClawHubSkillModeration
  tags?: Record<string, string>
  stats?: Record<string, unknown>
}

export type ClawHubSkillOrigin = {
  registry: 'clawhub'
  slug: string
  version: string
  installedAt: string
  updatedAt: string
  localSkillId: string
}

export type ClawHubInstalledSkill = {
  localSkillId: string
  slug: string
  version: string
  displayName: string
  installedAt: string
  updatedAt: string
  updateAvailable: boolean
  latestVersion?: string
}

export type ClawHubInstallResult =
  | { ok: true; localSkillId: string; version: string }
  | { ok: false; error: string }

export type ClawHubUpdateBatchResult = {
  localSkillId: string
  slug: string
  status: 'updated' | 'skipped' | 'failed'
  message?: string
  version?: string
}
