import { createRequire } from 'module'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { CONFIG_PROPERTIES_FILENAME } from './system-prop-keys'

export const openfde_HOME_DIRNAME = '.openfde'
export const openfde_DB_FILENAME = 'openfde.db'
export const openfde_MEMORY_VECTORS_DB_FILENAME = 'memory-vectors.db'

/** App-owned paths under `~/.openfde/` (not Electron `userData` as a whole). */
const openfde_APP_DIRS = [
  'config',
  'db',
  'logs',
  'memory',
  'workspace',
  'channels',
  'accounts',
  'skills',
  'toolSet',
  'workflows',
  'rules',
] as const

/** Channel session/data dirs under `~/.openfde/channels/`. */
export const openfde_CHANNEL_DATA_DIRS = [
  'whatsapp-auth',
  'telegram-data',
  'discord-data',
  'wechat-data',
  'slack-data',
] as const

const openfde_DB_DIRNAME = 'db'

let initialized = false
let openfdeHomePath: string | null = null

function resolveopenfdeHomePath(): string {
  return join(homedir(), openfde_HOME_DIRNAME)
}

export function getopenfdeHome(): string {
  if (!openfdeHomePath) {
    openfdeHomePath = resolveopenfdeHomePath()
  }
  if (!initialized) {
    initializeopenfdeHome(getElectronApp())
  }
  return openfdeHomePath
}

export function getopenfdeConfigDir(): string {
  const dir = join(getopenfdeHome(), 'config')
  ensureDir(dir)
  return dir
}

export function getopenfdeConfigPropertiesPath(): string {
  return join(getopenfdeConfigDir(), CONFIG_PROPERTIES_FILENAME)
}

export function getopenfdeDbDir(): string {
  const dir = join(getopenfdeHome(), openfde_DB_DIRNAME)
  ensureDir(dir)
  return dir
}

export function getopenfdeDbPath(): string {
  const path = join(getopenfdeDbDir(), openfde_DB_FILENAME)
  ensureParentDirForFile(path)
  return path
}

export function getopenfdeWorkspacePath(): string {
  const dir = join(getopenfdeHome(), 'workspace')
  ensureDir(dir)
  return dir
}

/** `~/.openfde/channels` — WhatsApp auth, Telegram/Discord/Slack/WeChat data. */
export function getopenfdeChannelsDir(): string {
  const dir = join(getopenfdeHome(), 'channels')
  ensureDir(dir)
  return dir
}

function getopenfdeChannelDataDir(
  name: (typeof openfde_CHANNEL_DATA_DIRS)[number],
): string {
  const dir = join(getopenfdeChannelsDir(), name)
  ensureDir(dir)
  return dir
}

/** Per-run and per-conversation agent sandboxes (`<root>/skills`, `output/`, etc.). */
export function getopenfdeSandboxDir(): string {
  const dir = join(getopenfdeWorkspacePath(), 'sandbox')
  ensureDir(dir)
  return dir
}

export function getopenfdeAccountsDir(): string {
  const dir = join(getopenfdeHome(), 'accounts')
  ensureDir(dir)
  return dir
}

export function getopenfdeWhatsAppAuthDir(): string {
  return getopenfdeChannelDataDir('whatsapp-auth')
}

export function getopenfdeTelegramDataDir(): string {
  return getopenfdeChannelDataDir('telegram-data')
}

export function getopenfdeDiscordDataDir(): string {
  return getopenfdeChannelDataDir('discord-data')
}

export function getopenfdeWeChatDataDir(): string {
  return getopenfdeChannelDataDir('wechat-data')
}

export function getopenfdeSlackDataDir(): string {
  return getopenfdeChannelDataDir('slack-data')
}

export function getopenfdeSkillsDir(): string {
  const dir = join(getopenfdeHome(), 'skills')
  ensureDir(dir)
  return dir
}

/** User overrides for shared tools (`~/.openfde/toolSet`). */
export function getopenfdeToolSetDir(): string {
  const dir = join(getopenfdeHome(), 'toolSet')
  ensureDir(dir)
  return dir
}

/** User-defined workflow folders (`~/.openfde/workflows`). */
export function getopenfdeWorkflowsDir(): string {
  const dir = join(getopenfdeHome(), 'workflows')
  ensureDir(dir)
  return dir
}

/** User project rules (`~/.openfde/rules`). Workspace rules live in `<project>/.openfde/rules/`. */
export function getopenfdeRulesDir(): string {
  const dir = join(getopenfdeHome(), 'rules')
  ensureDir(dir)
  return dir
}

export function getWorkflowSourceDir(workflowId: string): string {
  const dir = join(getopenfdeWorkflowsDir(), workflowId, 'source')
  ensureDir(dir)
  return dir
}

export function getWorkflowSandboxDir(workflowId: string, runId: string): string {
  const dir = join(getopenfdeWorkflowsDir(), workflowId, 'runs', runId)
  ensureDir(dir)
  return dir
}

export function getopenfdeLogsDir(): string {
  const dir = join(getopenfdeHome(), 'logs')
  ensureDir(dir)
  return dir
}

export function getopenfdeAgentLogsDir(): string {
  const dir = join(getopenfdeLogsDir(), 'agents')
  ensureDir(dir)
  return dir
}

/** Root for per-agent memory (`block`, `session`, `persona` under each agent id). */
export function getopenfdeMemoryDir(): string {
  const dir = join(getopenfdeHome(), 'memory')
  ensureDir(dir)
  return dir
}

/** SQLite database for vector memory records under `~/.openfde/memory/`. */
export function getopenfdeMemoryVectorsDbPath(): string {
  const path = join(getopenfdeMemoryDir(), openfde_MEMORY_VECTORS_DB_FILENAME)
  ensureParentDirForFile(path)
  return path
}

export type AgentMemoryDirs = {
  root: string
  block: string
  session: string
  persona: string
}

function sanitizeAgentIdForPath(agentId: string): string {
  const cleaned = agentId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'unknown-agent'
}

/** `~/.openfde/memory/<agent-id>/{block,session}` (persona is global under `users/`). */
export function getAgentMemoryDirs(agentId: string): AgentMemoryDirs {
  const root = join(getopenfdeMemoryDir(), sanitizeAgentIdForPath(agentId))
  const block = join(root, 'block')
  const session = join(root, 'session')
  const persona = join(root, 'persona')
  ensureDir(block)
  ensureDir(session)
  ensureDir(persona)
  return { root, block, session, persona }
}

function sanitizeUserIdForMemoryPath(userId: string): string {
  const cleaned = userId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'default'
}

/**
 * Global persona profile for a user — all agents and all conversations.
 * `~/.openfde/memory/users/<user-id>/persona/profile.json`
 */
export function resolveGlobalPersonaSnapshotPath(userId: string): string {
  return join(
    getopenfdeMemoryDir(),
    'users',
    sanitizeUserIdForMemoryPath(userId),
    'persona',
    'profile.json',
  )
}

/** Ensures parent dirs exist; use for writes only. */
export function getGlobalPersonaSnapshotPath(userId: string): string {
  const path = resolveGlobalPersonaSnapshotPath(userId)
  ensureDir(dirname(path))
  return path
}

/** Read-only path for per-agent persona (`memory/<agent-id>/persona/profile.json`). */
export function resolveAgentPersonaSnapshotPath(agentId: string): string {
  return join(
    getopenfdeMemoryDir(),
    sanitizeAgentIdForPath(agentId),
    'persona',
    'profile.json',
  )
}

type ElectronAppLike = {
  getPath: (name: string) => string
}

function getElectronApp(): ElectronAppLike | null {
  try {
    const require = createRequire(import.meta.url)
    const electronModule = require('electron') as {
      app?: ElectronAppLike
      default?: { app?: ElectronAppLike }
    }
    return electronModule.app ?? electronModule.default?.app ?? null
  } catch {
    return null
  }
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

/** Ensures the parent directory of a file path exists (for SQLite DBs, JSON writes, etc.). */
export function ensureParentDirForFile(filePath: string): void {
  ensureDir(dirname(resolve(filePath)))
}

/**
 * Creates `~/.openfde/` and standard subdirectories on first use.
 * Electron `userData` stays at the default OS location for Chromium internals.
 */
export function initializeopenfdeHome(app?: ElectronAppLike | null): string {
  const home = resolve(resolveopenfdeHomePath())

  if (initialized) {
    return openfdeHomePath ?? home
  }

  openfdeHomePath = home
  initialized = true

  ensureDir(home)
  for (const dir of openfde_APP_DIRS) {
    ensureDir(join(home, dir))
  }
  ensureDir(join(home, 'workspace', 'sandbox'))

  for (const name of openfde_CHANNEL_DATA_DIRS) {
    ensureDir(join(home, 'channels', name))
  }

  return home
}

export function isopenfdeHomeInitialized(): boolean {
  return initialized
}

/** Default Electron userData path for a given app name. */
export function guessDefaultElectronUserData(appName = 'openfde'): string {
  const platform = process.platform
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', appName)
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    return join(appData, appName)
  }
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
    appName,
  )
}
