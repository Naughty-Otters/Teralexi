/**
 * GitHub OAuth 2.0 – Installed-App / Loopback flow
 *
 * Opens a Chromium window to the GitHub consent screen, listens on a
 * temporary localhost port for the redirect callback, exchanges the
 * auth code for a token, and persists it under ~/.openfde/accounts/.
 *
 * Configure a GitHub OAuth App with callback URL `http://127.0.0.1:7780`.
 * Optional overrides:
 *   app.github.clientId / app.github.clientSecret in config.properties
 *   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET in the environment
 *
 * Scopes requested: repo, read:org, workflow, gist, read:user
 * for the github skill tools (via GH_TOKEN passed to gh).
 */

import { BrowserWindow } from 'electron'
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { request as httpsRequest } from 'node:https'
import { parse as parseUrl } from 'url'
import { randomBytes, createHash } from 'crypto'
import config from '@config/index'
import {
  BUNDLED_GITHUB_OAUTH_CLIENT_ID,
  BUNDLED_GITHUB_OAUTH_CLIENT_SECRET,
} from '@config/github-oauth-defaults'
import { getopenfdeAccountsDir } from '@config/openfde-home'
import { createLogger, traceFunction } from '@main/logger'

// ── Types ─────────────────────────────────────────────────────────────────

export interface GitHubTokens {
  access_token: string
  token_type: string
  scope: string
}

export interface GitHubUserInfo {
  id: number
  login: string
  name: string
  email: string
  avatar_url: string
}

export interface GitHubAccount {
  tokens: GitHubTokens
  userInfo: GitHubUserInfo
}

// ── Config ────────────────────────────────────────────────────────────────

/** Minimum OAuth scopes required for github_* skill tools (via gh). */
export const GITHUB_SKILL_SCOPES = [
  'repo',
  'read:org',
  'workflow',
] as const

/** Extra scopes requested at sign-in; not required for skillAccess. */
const GITHUB_OPTIONAL_SIGNIN_SCOPES = ['gist'] as const

const SCOPES = [...GITHUB_SKILL_SCOPES, ...GITHUB_OPTIONAL_SIGNIN_SCOPES].join(' ')

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails'
const LOOPBACK_PORT = 7780
const USER_AGENT = 'OpenFDE'

const log = createLogger('services.github-oauth')

export function resolveGitHubOAuthCredentials(): {
  clientId: string
  clientSecret: string
} {
  const clientId =
    config.github.clientId.trim() ||
    process.env.GITHUB_CLIENT_ID?.trim() ||
    BUNDLED_GITHUB_OAUTH_CLIENT_ID
  const clientSecret =
    config.github.clientSecret.trim() ||
    process.env.GITHUB_CLIENT_SECRET?.trim() ||
    BUNDLED_GITHUB_OAUTH_CLIENT_SECRET
  return { clientId, clientSecret }
}

export function parseGitHubScopes(scope: string | undefined): string[] {
  return (scope ?? '')
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

export function githubMissingSkillScopes(scope: string | undefined): string[] {
  const granted = new Set(parseGitHubScopes(scope))
  return GITHUB_SKILL_SCOPES.filter((required) => !granted.has(required))
}

export function githubAccountHasSkillAccess(scope: string | undefined): boolean {
  return githubMissingSkillScopes(scope).length === 0
}

export function githubAccountInfoForUi(account: GitHubAccount): GitHubAccountUiInfo {
  const missingScopes = githubMissingSkillScopes(account.tokens.scope)
  return {
    login: account.userInfo.login,
    name: account.userInfo.name || account.userInfo.login,
    email: account.userInfo.email,
    avatarUrl: account.userInfo.avatar_url,
    skillAccess: missingScopes.length === 0,
    missingScopes,
  }
}

export type GitHubAccountUiInfo = {
  login: string
  name: string
  email: string
  avatarUrl: string
  skillAccess: boolean
  missingScopes: string[]
}

function getCredentials(): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } = resolveGitHubOAuthCredentials()
  if (!clientId.trim()) {
    throw new Error(
      'GitHub OAuth is not configured. Add app.github.clientId and app.github.clientSecret to ~/.openfde/config/config.properties (OAuth App callback: http://127.0.0.1:7780).',
    )
  }
  if (!clientSecret.trim()) {
    throw new Error(
      'GitHub OAuth client secret is missing. Add app.github.clientSecret to ~/.openfde/config/config.properties.',
    )
  }
  return { clientId, clientSecret }
}

function base64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

// ── Token persistence ─────────────────────────────────────────────────────

function getTokenFilePath(): string {
  const dir = getopenfdeAccountsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'github-account.json')
}

function loadStoredAccountImpl(): GitHubAccount | null {
  try {
    const filePath = getTokenFilePath()
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8').trim()
    if (!raw) return null
    return JSON.parse(raw) as GitHubAccount
  } catch {
    return null
  }
}

function persistAccount(account: GitHubAccount): void {
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

// ── HTTP helpers ──────────────────────────────────────────────────────────

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
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': USER_AGENT,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
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
  return httpsGetWithHeaders(url, accessToken).then((result) => result.body)
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const key = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === name.toLowerCase(),
  )
  if (!key) return ''
  const value = headers[key]
  return Array.isArray(value) ? value.join(',') : (value ?? '')
}

function httpsGetWithHeaders(
  url: string,
  accessToken: string,
): Promise<{
  body: Record<string, unknown>
  headers: Record<string, string | string[] | undefined>
}> {
  return new Promise((resolve, reject) => {
    const parsed = parseUrl(url)
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path: parsed.path,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': USER_AGENT,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          try {
            resolve({
              body: JSON.parse(data) as Record<string, unknown>,
              headers: res.headers,
            })
          } catch (e) {
            reject(e)
          }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

async function httpsGetArray(
  url: string,
  accessToken: string,
): Promise<Array<Record<string, unknown>>> {
  const raw = await httpsGet(url, accessToken)
  return Array.isArray(raw) ? raw : []
}

// ── Loopback server ───────────────────────────────────────────────────────

function waitForOAuthCallback(port: number, state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = parseUrl(req.url ?? '', true)
      const code = reqUrl.query.code as string | undefined
      const returnedState = reqUrl.query.state as string | undefined
      const error = reqUrl.query.error as string | undefined

      const html = (msg: string) =>
        `<html><body style="font-family:sans-serif;padding:40px"><h2>${msg}</h2><p>You can close this window.</p></body></html>`

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(html(`Sign-in failed: ${error}`))
        server.close()
        reject(new Error(`OAuth error: ${error}`))
        return
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(html('Invalid callback.'))
        server.close()
        reject(new Error('Invalid OAuth callback: state mismatch or missing code.'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html('Sign-in successful! You can close this window.'))
      server.close()
      resolve(code)
    })

    server.on('error', reject)
    server.listen(port)
  })
}

async function resolvePrimaryEmail(
  accessToken: string,
  fallback: string,
): Promise<string> {
  if (fallback.trim()) return fallback
  const emails = await httpsGetArray(GITHUB_EMAILS_URL, accessToken)
  const primary = emails.find((entry) => entry.primary === true)
  const chosen = primary ?? emails[0]
  return typeof chosen?.email === 'string' ? chosen.email : ''
}

// ── Main OAuth flow ───────────────────────────────────────────────────────

async function startGitHubSignInImpl(): Promise<GitHubAccount> {
  log.info('Starting GitHub sign-in flow')
  const { clientId, clientSecret } = getCredentials()

  const redirectUri = `http://127.0.0.1:${LOOPBACK_PORT}`
  const state = randomBytes(16).toString('hex')
  const codeVerifier = base64Url(randomBytes(64))
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest())

  const authUrl =
    `${GITHUB_AUTH_URL}?` +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString()

  const codePromise = waitForOAuthCallback(LOOPBACK_PORT, state)

  const win = new BrowserWindow({
    width: 520,
    height: 720,
    title: 'Sign in with GitHub',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.loadURL(authUrl)

  let code: string
  try {
    code = await codePromise
  } finally {
    if (!win.isDestroyed()) win.close()
  }

  const tokenResponse = await httpsPost(GITHUB_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  if (typeof tokenResponse.error === 'string') {
    throw new Error(
      `Token exchange failed: ${tokenResponse.error} – ${tokenResponse.error_description ?? ''}`,
    )
  }

  const tokens: GitHubTokens = {
    access_token: tokenResponse.access_token as string,
    token_type: (tokenResponse.token_type as string) ?? 'bearer',
    scope: '',
  }

  const { body: userInfoRaw, headers } = await httpsGetWithHeaders(
    GITHUB_USER_URL,
    tokens.access_token,
  )
  const scopeFromToken =
    typeof tokenResponse.scope === 'string' ? tokenResponse.scope.trim() : ''
  const scopeFromHeader = headerValue(headers, 'x-oauth-scopes').trim()
  tokens.scope = scopeFromToken || scopeFromHeader || SCOPES

  const email = await resolvePrimaryEmail(
    tokens.access_token,
    (userInfoRaw.email as string | null | undefined) ?? '',
  )
  const userInfo: GitHubUserInfo = {
    id: Number(userInfoRaw.id),
    login: userInfoRaw.login as string,
    name: (userInfoRaw.name as string | null | undefined) ?? '',
    email,
    avatar_url: (userInfoRaw.avatar_url as string) ?? '',
  }

  const account: GitHubAccount = { tokens, userInfo }
  persistAccount(account)
  return account
}

/** Returns a stored access token for github skill tools. */
function getValidAccessTokenImpl(): string {
  const account = loadStoredAccount()
  if (!account?.tokens.access_token) {
    throw new Error('Not signed in with GitHub.')
  }
  return account.tokens.access_token
}

export function githubTokenEnv(): Record<string, string> {
  try {
    const token = getValidAccessToken()
    return { GH_TOKEN: token, GITHUB_TOKEN: token }
  } catch {
    return {}
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

export const startGitHubSignIn = traceFunction(
  log,
  'startGitHubSignIn',
  startGitHubSignInImpl,
)

export const getValidAccessToken = traceFunction(
  log,
  'getValidAccessToken',
  getValidAccessTokenImpl,
)
