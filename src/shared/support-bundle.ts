export type SupportReportOptions = {
  /** User description of the problem. */
  comments: string
  conversationId?: string | null
  agentId?: string | null
  includeSandbox?: boolean
  includeMemory?: boolean
  /** When true, POST to configured upload URL after building the zip. */
  upload?: boolean
}

export type SupportReportSkipReason = 'cooldown' | 'daily_limit'

export type SupportReportResult = {
  ok: boolean
  reportId: string
  zipPath?: string
  uploaded?: boolean
  skippedUpload?: boolean
  skipReason?: SupportReportSkipReason
  uploadsRemainingToday?: number
  uploadCooldownRemainingSeconds?: number
  error?: string
}

export type SupportConfig = {
  baseApiUrl: string
  uploadUrl: string
  uploadConfigured: boolean
  maxMegabytes: number
  maxUploadsPerDay: number
  uploadCooldownMinutes: number
  uploadsToday?: number
  uploadsRemainingToday?: number
}

export type SupportClientErrorPayload = {
  message: string
  stack?: string
  info?: string
  conversationId?: string
  agentId?: string
  route?: string
}

export type SupportBundleManifest = {
  reportId: string
  createdAt: string
  appVersion: string
  platform: string
  arch: string
  electronVersion: string
  isPackaged: boolean
  conversationId?: string
  agentId?: string
  comments: string
  includeSandbox: boolean
  includeMemory: boolean
  bundleSha256?: string
}

/** Expected multipart POST body for `{BASE_API}/support/upload`. */
export type SupportUploadFields = {
  location: string
  file: File | Blob
  reportId?: string
  comments?: string
  appVersion?: string
  manifest?: string
}
