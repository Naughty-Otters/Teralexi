export const TERALEXI_PROTOCOL = 'teralexi'
export const TERALEXI_OPEN_HOST = 'open'
export const TERALEXI_CALLBACK_URL = `${TERALEXI_PROTOCOL}://${TERALEXI_OPEN_HOST}`

export type TeralexiOpenAction = {
  type: 'open'
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  scope?: string
}

export type TeralexiProtocolAction = TeralexiOpenAction

/** Parse `teralexi://open?token=<xxx>` (also accepts `access_token`, hash fragments). */
export function parseTeralexiProtocolUrl(rawUrl: string): TeralexiProtocolAction | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== `${TERALEXI_PROTOCOL}:`) return null

    const host = url.hostname || url.pathname.replace(/^\//, '').split('/')[0]
    if (host !== TERALEXI_OPEN_HOST) return null

    const params = new URLSearchParams(url.search)
    // OAuth servers often return tokens in the hash fragment (#token=...).
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
    if (hash) {
      const hashParams = new URLSearchParams(hash)
      for (const [key, value] of hashParams.entries()) {
        if (!params.has(key)) params.set(key, value)
      }
    }

    const accessToken =
      params.get('token')?.trim() ||
      params.get('id_token')?.trim() ||
      params.get('access_token')?.trim()
    if (!accessToken) return null

    const refreshToken = params.get('refresh_token')?.trim()
    const expiresRaw = params.get('expires_in')?.trim()
    const expiresIn =
      expiresRaw && Number.isFinite(Number(expiresRaw))
        ? Number(expiresRaw)
        : undefined
    const scope = params.get('scope')?.trim()

    return {
      type: 'open',
      accessToken,
      refreshToken: refreshToken || undefined,
      expiresIn,
      scope: scope || undefined,
    }
  } catch {
    return null
  }
}
