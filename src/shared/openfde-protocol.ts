export const OPENFDE_PROTOCOL = 'openfde'
export const OPENFDE_OPEN_HOST = 'open'
export const OPENFDE_CALLBACK_URL = `${OPENFDE_PROTOCOL}://${OPENFDE_OPEN_HOST}`

export type OpenFdeOpenAction = {
  type: 'open'
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  scope?: string
}

export type OpenFdeProtocolAction = OpenFdeOpenAction

/** Parse `openfde://open?token=<xxx>` (also accepts `access_token`). */
export function parseOpenFdeProtocolUrl(rawUrl: string): OpenFdeProtocolAction | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== `${OPENFDE_PROTOCOL}:`) return null

    const host = url.hostname || url.pathname.replace(/^\//, '').split('/')[0]
    if (host !== OPENFDE_OPEN_HOST) return null

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
