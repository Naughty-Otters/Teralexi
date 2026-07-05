/**
 * Google Workspace OAuth – loopback flow for Gmail, Calendar, and Drive.
 *
 * End users configure their own Google Cloud OAuth app under
 * Settings → Agents → Google Workspace → Configurations (client ID + secret).
 * Tokens are stored in ~/.openfde/accounts/google-workspace-account.json.
 */

import { BrowserWindow } from 'electron'
import { createServer, type Server } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { request as httpsRequest } from 'node:https'
import { parse as parseUrl } from 'url'
import { randomBytes, createHash } from 'crypto'
import { getSystemPropValue } from '@config/system-prop'
import { getopenfdeAccountsDir } from '@config/openfde-home'
import {
  GoogleWorkspaceOAuthNotConfiguredError,
  GOOGLE_WORKSPACE_PROP_KEYS,
  isGoogleWorkspaceOAuthConfigured,
} from '@shared/google-workspace-settings'
import { createLogger, traceFunction } from '@main/logger'
import { notifyGoogleWorkspaceAccountChanged } from '@main/services/google-workspace-account-notify'

export interface GoogleTokens {
  access_token: string
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

export interface GoogleWorkspaceAccount {
  tokens: GoogleTokens
  userInfo: GoogleUserInfo
}

export type GoogleWorkspaceAccountUiInfo = {
  email: string
  name: string
  picture: string
  workspaceAccess: boolean
}

/** OAuth scopes for Gmail, Calendar, and Drive (Google Workspace skill). */
export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
] as const

const SCOPES = ['openid', 'email', 'profile', ...GOOGLE_WORKSPACE_SCOPES].join(
  ' ',
)

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const GOOGLE_OAUTH_LOOPBACK_PORT = 7779
const log = createLogger('services.google-workspace-oauth')

export function resolveGoogleWorkspaceOAuthCredentials(): {
  clientId: string
  clientSecret?: string
} {
  const clientId = getSystemPropValue(
    GOOGLE_WORKSPACE_PROP_KEYS.clientId,
    '',
  ).trim()
  const clientSecret = getSystemPropValue(
    GOOGLE_WORKSPACE_PROP_KEYS.clientSecret,
    '',
  ).trim()

  return {
    clientId,
    clientSecret: clientSecret || undefined,
  }
}

export function googleWorkspaceOAuthIsConfigured(): boolean {
  return isGoogleWorkspaceOAuthConfigured(
    resolveGoogleWorkspaceOAuthCredentials(),
  )
}

function assertGoogleWorkspaceOAuthConfigured(): void {
  if (!googleWorkspaceOAuthIsConfigured()) {
    throw new GoogleWorkspaceOAuthNotConfiguredError()
  }
}

export function googleAccountHasWorkspaceAccess(scope: string | undefined): boolean {
  const granted = new Set((scope ?? '').split(/\s+/).filter(Boolean))
  return GOOGLE_WORKSPACE_SCOPES.every((required) => granted.has(required))
}

export function googleWorkspaceAccountInfoForUi(
  account: GoogleWorkspaceAccount,
): GoogleWorkspaceAccountUiInfo {
  return {
    email: account.userInfo.email,
    name: account.userInfo.name,
    picture: account.userInfo.picture,
    workspaceAccess: googleAccountHasWorkspaceAccess(account.tokens.scope),
  }
}

function getCredentials(): { clientId: string; clientSecret?: string } {
  return resolveGoogleWorkspaceOAuthCredentials()
}

function base64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function getTokenFilePath(): string {
  const dir = getopenfdeAccountsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'google-workspace-account.json')
}

function loadStoredAccountImpl(): GoogleWorkspaceAccount | null {
  try {
    const filePath = getTokenFilePath()
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8').trim()
    if (!raw) return null
    return JSON.parse(raw) as GoogleWorkspaceAccount
  } catch {
    return null
  }
}

function persistAccount(account: GoogleWorkspaceAccount): void {
  const filePath = getTokenFilePath()
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, JSON.stringify(account, null, 2), 'utf-8')
}

function clearStoredAccountImpl(): void {
  try {
    const filePath = getTokenFilePath()
    if (existsSync(filePath)) {
      writeFileSync(filePath, '', 'utf-8')
    }
  } catch {
    // ignore
  }
}

function httpsPost(
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString()
    const parsed = parseUrl(url)
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path: parsed.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
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
    req.write(body)
    req.end()
  })
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

type GoogleSignInSession = {
  cancel: (error: Error) => void
  browserWindow: BrowserWindow | null
}

let activeGoogleSignInSession: GoogleSignInSession | null = null
let inFlightGoogleSignIn: Promise<GoogleWorkspaceAccount> | null = null

function cancelActiveGoogleSignIn(reason: string): void {
  const session = activeGoogleSignInSession
  if (!session) return
  activeGoogleSignInSession = null
  session.cancel(new Error(reason))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForLoopbackPortRelease(): Promise<void> {
  await delay(150)
}

function waitForOAuthCallback(
  port: number,
  state: string,
): GoogleSignInSession & { promise: Promise<string> } {
  let server: Server | undefined
  let resolveCode: ((code: string) => void) | undefined
  let rejectCode: ((err: Error) => void) | undefined
  let settled = false
  let browserWindow: BrowserWindow | null = null

  const settle = (action: 'resolve' | 'reject', value: string | Error) => {
    if (settled) return
    settled = true
    if (server) {
      server.close()
      server = undefined
    }
    if (action === 'resolve') resolveCode!(value as string)
    else rejectCode!(value as Error)
  }

  const cancel = (error: Error) => {
    settle('reject', error)
    if (browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.close()
    }
  }

  const promise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject

    server = createServer((req, res) => {
      const reqUrl = parseUrl(req.url ?? '', true)
      const code = reqUrl.query.code as string | undefined
      const returnedState = reqUrl.query.state as string | undefined
      const error = reqUrl.query.error as string | undefined

      const html = (msg: string) =>
        `<html><body style="font-family:sans-serif;padding:40px"><h2>${msg}</h2><p>You can close this window.</p></body></html>`

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(html(`Sign-in failed: ${error}`))
        settle('reject', new Error(`OAuth error: ${error}`))
        return
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(html('Invalid callback.'))
        settle(
          'reject',
          new Error('Invalid OAuth callback: state mismatch or missing code.'),
        )
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html('Sign-in successful! You can close this window.'))
      settle('resolve', code)
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        settle(
          'reject',
          new Error(
            'Google Workspace sign-in is already in progress. Close the sign-in window and try again.',
          ),
        )
        return
      }
      settle('reject', err)
    })
    server.listen(port)
  })

  return {
    promise,
    cancel,
    get browserWindow() {
      return browserWindow
    },
    set browserWindow(win: BrowserWindow | null) {
      browserWindow = win
    },
  }
}

async function startGoogleWorkspaceSignInImpl(): Promise<GoogleWorkspaceAccount> {
  if (inFlightGoogleSignIn) {
    cancelActiveGoogleSignIn('Restarting Google Workspace sign-in')
    try {
      await inFlightGoogleSignIn
    } catch {
      /* prior attempt failed or was cancelled */
    }
    await waitForLoopbackPortRelease()
  }

  const flow = runGoogleWorkspaceSignInFlow()
  inFlightGoogleSignIn = flow
  try {
    return await flow
  } finally {
    if (inFlightGoogleSignIn === flow) {
      inFlightGoogleSignIn = null
    }
  }
}

async function runGoogleWorkspaceSignInFlow(): Promise<GoogleWorkspaceAccount> {
  assertGoogleWorkspaceOAuthConfigured()
  log.info('Starting Google Workspace sign-in flow')
  const { clientId, clientSecret } = getCredentials()

  const port = GOOGLE_OAUTH_LOOPBACK_PORT
  const redirectUri = `http://127.0.0.1:${port}`
  const state = randomBytes(16).toString('hex')
  const codeVerifier = base64Url(randomBytes(64))
  const codeChallenge = base64Url(
    createHash('sha256').update(codeVerifier).digest(),
  )

  const authUrl =
    `${GOOGLE_AUTH_URL}?` +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent select_account',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString()

  cancelActiveGoogleSignIn('Starting a new Google Workspace sign-in')
  await waitForLoopbackPortRelease()

  const callback = waitForOAuthCallback(port, state)
  activeGoogleSignInSession = callback

  const win = new BrowserWindow({
    width: 520,
    height: 680,
    title: 'Sign in with Google Workspace',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  callback.browserWindow = win

  win.loadURL(authUrl)
  win.on('closed', () => {
    callback.cancel(new Error('Sign-in cancelled'))
  })

  let code: string
  try {
    code = await callback.promise
  } finally {
    if (activeGoogleSignInSession === callback) {
      activeGoogleSignInSession = null
    }
    if (!win.isDestroyed()) win.close()
  }

  const tokenParams: Record<string, string> = {
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  }
  if (clientSecret) tokenParams.client_secret = clientSecret

  const tokenResponse = await httpsPost(GOOGLE_TOKEN_URL, tokenParams)

  if (typeof tokenResponse.error === 'string') {
    throw new Error(
      `Token exchange failed: ${tokenResponse.error} – ${tokenResponse.error_description ?? ''}`,
    )
  }

  const tokens: GoogleTokens = {
    access_token: tokenResponse.access_token as string,
    refresh_token: tokenResponse.refresh_token as string | undefined,
    expires_at: Date.now() + Number(tokenResponse.expires_in ?? 3600) * 1000,
    token_type: (tokenResponse.token_type as string) ?? 'Bearer',
    scope: (tokenResponse.scope as string) ?? SCOPES,
  }

  const userInfoRaw = await httpsGet(GOOGLE_USERINFO_URL, tokens.access_token)
  const userInfo: GoogleUserInfo = {
    sub: userInfoRaw.sub as string,
    email: userInfoRaw.email as string,
    name: userInfoRaw.name as string,
    picture: (userInfoRaw.picture as string) ?? '',
  }

  const account: GoogleWorkspaceAccount = { tokens, userInfo }
  persistAccount(account)
  notifyGoogleWorkspaceAccountChanged(googleWorkspaceAccountInfoForUi(account))
  return account
}

async function refreshGoogleTokenImpl(
  account: GoogleWorkspaceAccount,
): Promise<GoogleWorkspaceAccount> {
  log.info('Refreshing Google Workspace access token')
  const { clientId, clientSecret } = getCredentials()
  if (!account.tokens.refresh_token) {
    throw new Error('No refresh token available; user must sign in again.')
  }

  const tokenParams: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: account.tokens.refresh_token,
    client_id: clientId,
  }
  if (clientSecret) tokenParams.client_secret = clientSecret

  const tokenResponse = await httpsPost(GOOGLE_TOKEN_URL, tokenParams)

  if (typeof tokenResponse.error === 'string') {
    throw new Error(`Token refresh failed: ${tokenResponse.error}`)
  }

  account.tokens.access_token = tokenResponse.access_token as string
  account.tokens.expires_at =
    Date.now() + Number(tokenResponse.expires_in ?? 3600) * 1000
  if (tokenResponse.refresh_token) {
    account.tokens.refresh_token = tokenResponse.refresh_token as string
  }

  persistAccount(account)
  return account
}

async function getValidAccessTokenImpl(): Promise<string> {
  let account = loadStoredAccount()
  if (!account) throw new Error('Not signed in with Google Workspace.')
  if (Date.now() >= account.tokens.expires_at - 60_000) {
    account = await refreshGoogleToken(account)
  }
  return account.tokens.access_token
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

export const startGoogleWorkspaceSignIn = traceFunction(
  log,
  'startGoogleWorkspaceSignIn',
  startGoogleWorkspaceSignInImpl,
)

export const refreshGoogleToken = traceFunction(
  log,
  'refreshGoogleToken',
  refreshGoogleTokenImpl,
)

export const getValidAccessToken = traceFunction(
  log,
  'getValidAccessToken',
  getValidAccessTokenImpl,
)
