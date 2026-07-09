import { normalizeTeralexiBaseApiUrl } from '@shared/teralexi-platform-api'

/** JWT `iss` claim must match the API base URL for the active build. */
export function expectedIssuerFor(apiBase: string): string {
  const normalized = normalizeTeralexiBaseApiUrl(apiBase)
  if (!normalized) {
    throw new Error('Teralexi API base URL is not configured')
  }
  return normalized
}
