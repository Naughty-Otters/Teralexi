/**
 * Teralexi Google Account OAuth – platform account linking via browser + teralexi://
 *
 * Separate from Google Workspace (Gmail/Calendar/Drive). The web app redirects
 * with platform tokens (`teralexi://open?access_token=&refresh_token=`) or a
 * Google `id_token` to exchange. Sign-in opens the Teralexi `/auth/login` URL.
 *
 * Identity is persisted under ~/.teralexi/accounts/google-account.json.
 * Platform access + refresh tokens live in server-auth.json (see teralexi-server-auth).
 */

import { shell } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { request as httpsRequest } from 'node:https'
import { parse as parseUrl } from 'url'
import { getTeralexiAccountsDir } from '@config/teralexi-home'
import { isPackagedRuntime } from '@config/env-overrides'
import {
  DEFAULT_TERALEXI_GOOGLE_AUTH_LOGIN_URL_DEV,
  GoogleAccountNotConfiguredError,
  isTeralexiGoogleAccountSignInConfigured,
} from '@shared/google-account-settings'
import { getTeralexiGoogleAuthLoginUrl as resolveConfiguredGoogleAuthLoginUrl, getTeralexiBaseApiUrl } from '@main/services/teralexi-platform-config'
import {
  joinTeralexiPlatformUrl,
  TERALEXI_PLATFORM_PATHS,
} from '@shared/teralexi-platform-api'
import { TERALEXI_CALLBACK_URL } from '@shared/teralexi-protocol'
import {
  googleProfileFromIdToken,
  isGoogleIdToken,
  decodeJwtPayload,
} from '@shared/google-id-token'
import { createLogger, traceFunction } from '@main/logger'
import { notifyGoogleAccountChanged } from '@main/services/google-account-notify'
import { onGoogleAccountSignedIn } from '@main/services/entitlement-session'

export interface GoogleAccountTokens {
  access_token: string
  id_token?: string
  refresh_token?: string
  expires_at: number
  token_type: string
  scope: string
}

export interface GoogleUserInfo {
  sub: string
  email: string
  name: string
  picture: string
}

export interface GoogleAccount {
  tokens: GoogleAccountTokens
  userInfo: GoogleUserInfo
}

export type GoogleAccountUiInfo = {
  email: string
  name: string
  picture: string
}

export type GoogleAccountOAuthCallbackParams = {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  scope?: string
}

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000
const log = createLogger('services.google-account-oauth')

export function resolveTeralexiGoogleAuthLoginUrl(): string {
  const resolved = resolveConfiguredGoogleAuthLoginUrl()
  if (resolved) return resolved
  if (isPackagedRuntime()) return ''
  return DEFAULT_TERALEXI_GOOGLE_AUTH_LOGIN_URL_DEV
}

export function googleAccountSignInIsConfigured(): boolean {
  return isTeralexiGoogleAccountSignInConfigured(resolveTeralexiGoogleAuthLoginUrl())
}

function assertGoogleAccountSignInConfigured(): void {
  if (!googleAccountSignInIsConfigured()) {
    throw new GoogleAccountNotConfiguredError()
  }
}

export function googleAccountInfoForUi(account: GoogleAccount): GoogleAccountUiInfo {
  return {
    email: account.userInfo.email,
    name: account.userInfo.name,
    picture: account.userInfo.picture,
  }
}

function buildAuthLoginUrl(): string {
  const base = resolveTeralexiGoogleAuthLoginUrl()
  const url = new URL(base)
  url.searchParams.set('redirect_uri', TERALEXI_CALLBACK_URL)
  return url.toString()
}

function getTokenFilePath(): string {
  const dir = getTeralexiAccountsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'google-account.json')
}

function loadStoredAccountImpl(): GoogleAccount | null {
  try {
    const filePath = getTokenFilePath()
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8').trim()
    if (!raw) return null
    return JSON.parse(raw) as GoogleAccount
  } catch {
    return null
  }
}

function persistAccount(account: GoogleAccount): void {
  const filePath = getTokenFilePath()
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, JSON.stringify(account, null, 2), 'utf-8')
}

function clearStoredAccountImpl(): void {
  try {
    const filePath = getTokenFilePath()
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch {
    // ignore
  }
}

function httpsGet(
  url: string,
  accessToken: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const parsed = parseUrl(url)
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path: parsed.path,
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch (e) { reject(e) }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

type PendingGoogleSignIn = {
  resolve: (account: GoogleAccount) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

let pendingGoogleSignIn: PendingGoogleSignIn | null = null
let inFlightGoogleSignIn: Promise<GoogleAccount> | null = null

function clearPendingGoogleSignIn(reason?: string): void {
  const pending = pendingGoogleSignIn
  if (!pending) return
  pendingGoogleSignIn = null
  clearTimeout(pending.timeoutId)
  if (reason) {
    pending.reject(new Error(reason))
  }
}

async function fetchPlatformUserProfile(
  accessToken: string,
): Promise<GoogleUserInfo | null> {
  const apiBase = getTeralexiBaseApiUrl()
  if (!apiBase) return null
  try {
    const url = joinTeralexiPlatformUrl(apiBase, TERALEXI_PLATFORM_PATHS.authMe)
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    const body = (await response.json()) as {
      id?: number
      sub_id?: string
      email?: string
      full_name?: string | null
      avatar_url?: string | null
    }
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const sub =
      (typeof body.sub_id === 'string' && body.sub_id.trim()) ||
      (body.id != null ? String(body.id) : '') ||
      email
    if (!sub) return null
    return {
      sub,
      email,
      name:
        (typeof body.full_name === 'string' && body.full_name.trim()) ||
        email ||
        sub,
      picture:
        typeof body.avatar_url === 'string' ? body.avatar_url.trim() : '',
    }
  } catch (err) {
    log.warn('Failed to load profile from /auth/me for avatar', { err })
    return null
  }
}

async function resolveGoogleUserInfo(
  bearerToken: string,
): Promise<GoogleUserInfo> {
  if (isGoogleIdToken(bearerToken)) {
    const profile = googleProfileFromIdToken(bearerToken)
    if (!profile?.sub) {
      throw new Error('Invalid Google ID token: missing profile claims.')
    }
    return {
      sub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    }
  }

  // Platform JWT from website login — claims often omit `picture`; fill from /me.
  const jwtProfile = googleProfileFromIdToken(bearerToken)
  if (jwtProfile?.sub && (jwtProfile.email || jwtProfile.name)) {
    const fromMe =
      !jwtProfile.picture.trim()
        ? await fetchPlatformUserProfile(bearerToken)
        : null
    return {
      sub: fromMe?.sub || jwtProfile.sub,
      email: fromMe?.email || jwtProfile.email,
      name: fromMe?.name || jwtProfile.name || jwtProfile.email,
      picture: fromMe?.picture || jwtProfile.picture,
    }
  }

  const fromMe = await fetchPlatformUserProfile(bearerToken)
  if (fromMe) return fromMe

  const userInfoRaw = await httpsGet(GOOGLE_USERINFO_URL, bearerToken)
  if (typeof userInfoRaw.error === 'string') {
    throw new Error(
      `Failed to fetch Google profile: ${userInfoRaw.error}`,
    )
  }

  return {
    sub: userInfoRaw.sub as string,
    email: userInfoRaw.email as string,
    name: userInfoRaw.name as string,
    picture: (userInfoRaw.picture as string) ?? '',
  }
}

async function applyGoogleAccountOAuthCallbackImpl(
  params: GoogleAccountOAuthCallbackParams,
): Promise<GoogleAccount> {
  log.info('Applying Teralexi Google account OAuth callback')
  const bearerToken = params.accessToken
  const idTokenProfile = isGoogleIdToken(bearerToken)
    ? googleProfileFromIdToken(bearerToken)
    : null

  const expiresAt =
    idTokenProfile?.expiresAtMs ??
    Date.now() + (params.expiresIn ?? 3600) * 1000

  const tokens: GoogleAccountTokens = idTokenProfile
    ? {
        access_token: '',
        id_token: bearerToken,
        refresh_token: params.refreshToken,
        expires_at: expiresAt,
        token_type: 'Bearer',
        scope: params.scope ?? 'openid email profile',
      }
    : {
        access_token: bearerToken,
        refresh_token: params.refreshToken,
        expires_at: expiresAt,
        token_type: 'Bearer',
        scope: params.scope ?? 'openid email profile',
      }

  const userInfo = await resolveGoogleUserInfo(bearerToken)
  const account: GoogleAccount = { tokens, userInfo }
  persistAccount(account)
  notifyGoogleAccountChanged(googleAccountInfoForUi(account))
  await onGoogleAccountSignedIn()
  return account
}

export async function handleGoogleAccountOAuthDeepLink(
  params: GoogleAccountOAuthCallbackParams,
): Promise<GoogleAccount> {
  const account = await applyGoogleAccountOAuthCallback(params)
  const pending = pendingGoogleSignIn
  if (pending) {
    pendingGoogleSignIn = null
    clearTimeout(pending.timeoutId)
    pending.resolve(account)
  }
  return account
}

async function startGoogleAccountSignInImpl(): Promise<GoogleAccount> {
  if (inFlightGoogleSignIn) {
    return inFlightGoogleSignIn
  }

  const flow = runGoogleAccountSignInFlow()
  inFlightGoogleSignIn = flow
  try {
    return await flow
  } finally {
    if (inFlightGoogleSignIn === flow) {
      inFlightGoogleSignIn = null
    }
  }
}

async function runGoogleAccountSignInFlow(): Promise<GoogleAccount> {
  assertGoogleAccountSignInConfigured()
  log.info('Starting Teralexi Google account sign-in via browser')

  const loginUrl = buildAuthLoginUrl()
  const tokenPromise = new Promise<GoogleAccount>((resolve, reject) => {
    pendingGoogleSignIn = {
      resolve,
      reject,
      timeoutId: setTimeout(() => {
        if (pendingGoogleSignIn?.resolve !== resolve) return
        clearPendingGoogleSignIn()
        reject(
          new Error(
            'Sign-in timed out. Complete authentication in the browser, then return to Teralexi.',
          ),
        )
      }, SIGN_IN_TIMEOUT_MS),
    }
  })

  await shell.openExternal(loginUrl)

  try {
    return await tokenPromise
  } finally {
    if (pendingGoogleSignIn?.resolve) {
      clearPendingGoogleSignIn()
    }
  }
}

export const loadStoredAccount = traceFunction(
  log,
  'loadStoredAccount',
  loadStoredAccountImpl,
)

export const clearStoredAccount = traceFunction(
  log,
  'clearStoredAccount',
  clearStoredAccountImpl,
)

export const applyGoogleAccountOAuthCallback = traceFunction(
  log,
  'applyGoogleAccountOAuthCallback',
  applyGoogleAccountOAuthCallbackImpl,
)

export const startGoogleAccountSignIn = traceFunction(
  log,
  'startGoogleAccountSignIn',
  startGoogleAccountSignInImpl,
)

/**
 * Google id_token from the linked Teralexi account (for server JWT exchange).
 * Returns the raw token even when locally soft-expired so callers can attempt
 * a remote exchange — blocking here caused main-active `no-token` loops after
 * the Google id_token's ~1h lifetime while the user was still signed in.
 */
export function getTeralexiAccountGoogleIdToken(): string | null {
  const account = loadStoredAccount()
  if (!account) return null
  return account.tokens.id_token?.trim() || null
}

/**
 * Platform JWT stored as `access_token` when the website deep link did not
 * send a Google id_token. Used to bootstrap server auth without exchange.
 */
export function getStoredPresentedServerAccessToken(): string | null {
  const account = loadStoredAccount()
  if (!account) return null
  const token = account.tokens.access_token?.trim()
  if (!token || isGoogleIdToken(token)) return null
  if (!decodeJwtPayload(token)) return null
  return token
}

/** Platform refresh token from the website handoff (`teralexi://open`). */
export function getStoredPresentedServerRefreshToken(): string | null {
  const account = loadStoredAccount()
  if (!account) return null
  // Only treat refresh as platform session when access is a platform JWT
  // (not a Google id_token exchange pending).
  if (!getStoredPresentedServerAccessToken()) return null
  return account.tokens.refresh_token?.trim() || null
}
