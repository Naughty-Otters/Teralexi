import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createLogger } from '@main/logger'

const log = createLogger('agent.tool-approval-secret')

const SECRET_ENV = 'TOOL_APPROVAL_SECRET'
const SECRET_FILENAME = 'tool-approval-secret'

let cachedSecret: string | undefined

function secretFilePath(): string | undefined {
  try {
    // Lazy-require so unit tests without Electron still work.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron')
    if (!app?.getPath) return undefined
    return join(app.getPath('userData'), 'security', SECRET_FILENAME)
  } catch {
    return undefined
  }
}

function readOrCreatePersistedSecret(): string {
  const path = secretFilePath()
  if (path) {
    try {
      if (existsSync(path)) {
        const existing = readFileSync(path, 'utf8').trim()
        if (existing.length >= 32) return existing
      }
    } catch (err) {
      log.warn('Failed to read tool approval secret; regenerating', { err })
    }

    const generated = randomBytes(32).toString('base64url')
    try {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, generated, { encoding: 'utf8', mode: 0o600 })
      return generated
    } catch (err) {
      log.warn('Failed to persist tool approval secret; using in-memory only', {
        err,
      })
      return generated
    }
  }

  return randomBytes(32).toString('base64url')
}

/**
 * HMAC secret for AI SDK `experimental_toolApprovalSecret`.
 * Prefer `TOOL_APPROVAL_SECRET` env; otherwise persist under Electron userData.
 */
export function getToolApprovalSecret(): string {
  const fromEnv = process.env[SECRET_ENV]?.trim()
  if (fromEnv) return fromEnv
  if (cachedSecret) return cachedSecret
  cachedSecret = readOrCreatePersistedSecret()
  return cachedSecret
}

/** Test helper — clear memoized secret. */
export function clearToolApprovalSecretCacheForTests(): void {
  cachedSecret = undefined
}
