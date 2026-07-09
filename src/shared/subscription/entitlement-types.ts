export const ENTITLEMENT_AUDIENCE = 'teralexi-desktop'

export const ENTITLEMENT_FEATURES = {
  METRICS_WRITE: 'metrics.write',
  SUPPORT_UPLOAD: 'support.upload',
} as const

export type EntitlementFeature =
  (typeof ENTITLEMENT_FEATURES)[keyof typeof ENTITLEMENT_FEATURES]

export type EntitlementVerifyState =
  | 'verified'
  | 'stale'
  | 'failed'
  | 'unsigned'

/** Renderer-safe entitlement snapshot (no raw JWT). */
export type EntitlementUiSnapshot = {
  plan: string
  planName: string
  status: string
  features: string[]
  revision: number
  fetchedAt: string
  expiresAt: string
  verifyState: EntitlementVerifyState
  /** Present when verifyState is failed. */
  errorMessage?: string
}

export type EntitlementApiPayload = {
  sub: string
  email: string
  plan: string
  plan_name: string
  status: string
  features: string[]
  limits: Record<string, unknown>
  revision: number
  valid_until: string | null
  server_time: string
  nonce?: string | null
}

export type EntitlementApiResponse = {
  payload: EntitlementApiPayload
  entitlement_token: string
  integrity_digest?: string
  signature?: {
    alg: string
    kid: string
    value: string
  }
}

export type EntitlementCache = {
  plan: string
  planName: string
  status: string
  features: string[]
  limits: Record<string, unknown>
  revision: number
  entitlementToken: string
  teralexiUserId: string
  fetchedAt: string
  serverTime: string
  expiresAt: string
}

export type VerifiedEntitlementClaims = {
  plan: string
  planName: string
  status: string
  features: string[]
  limits: Record<string, unknown>
  revision: number
  teralexiUserId: string
  expiresAt: Date
}
