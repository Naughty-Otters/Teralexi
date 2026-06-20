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

export type SupportReportResult = {
  ok: boolean
  reportId: string
  zipPath?: string
  uploaded?: boolean
  error?: string
}

export type SupportConfig = {
  uploadUrl: string
  uploadConfigured: boolean
  maxMegabytes: number
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

/** Expected multipart POST body for `app.support.uploadUrl`. */
export type SupportUploadFields = {
  reportId: string
  comments: string
  appVersion: string
  manifest: string
  bundle: File | Blob
}
