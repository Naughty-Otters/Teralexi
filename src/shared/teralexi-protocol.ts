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

/** Parse `teralexi://open?token=<xxx>` (also accepts `access_token`). */
export function parseTeralexiProtocolUrl(rawUrl: string): TeralexiProtocolAction | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== `${TERALEXI_PROTOCOL}:`) return null

    const host = url.hostname || url.pathname.replace(/^\//, '').split('/')[0]
    if (host !== TERALEXI_OPEN_HOST) return null

    const accessToken =
      url.searchParams.get('token')?.trim() ||
      url.searchParams.get('id_token')?.trim() ||
      url.searchParams.get('access_token')?.trim()
    if (!accessToken) return null

    const refreshToken = url.searchParams.get('refresh_token')?.trim()
    const expiresRaw = url.searchParams.get('expires_in')?.trim()
    const expiresIn =
      expiresRaw && Number.isFinite(Number(expiresRaw))
        ? Number(expiresRaw)
        : undefined
    const scope = url.searchParams.get('scope')?.trim()

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
