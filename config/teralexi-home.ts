import { createRequire } from 'module'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { CONFIG_PROPERTIES_FILENAME } from './system-prop-keys'

export const TERALEXI_HOME_DIRNAME = '.teralexi'
export const TERALEXI_DB_FILENAME = 'teralexi.db'
export const TERALEXI_MEMORY_VECTORS_DB_FILENAME = 'memory-vectors.db'

/** App-owned paths under `~/.teralexi/` (not Electron `userData` as a whole). */
const TERALEXI_APP_DIRS = [
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

/** Channel session/data dirs under `~/.teralexi/channels/`. */
export const TERALEXI_CHANNEL_DATA_DIRS = [
  'whatsapp-auth',
  'telegram-data',
  'discord-data',
  'wechat-data',
  'slack-data',
] as const

const TERALEXI_DB_DIRNAME = 'db'

let initialized = false
let teralexiHomePath: string | null = null

function resolveTeralexiHomePath(): string {
  return join(homedir(), TERALEXI_HOME_DIRNAME)
}

export function getTeralexiHome(): string {
  if (!teralexiHomePath) {
    teralexiHomePath = resolveTeralexiHomePath()
  }
  if (!initialized) {
    initializeTeralexiHome(getElectronApp())
  }
  return teralexiHomePath
}

export function getTeralexiConfigDir(): string {
  const dir = join(getTeralexiHome(), 'config')
  ensureDir(dir)
  return dir
}

export function getTeralexiConfigPropertiesPath(): string {
  return join(getTeralexiConfigDir(), CONFIG_PROPERTIES_FILENAME)
}

export function getTeralexiDbDir(): string {
  const dir = join(getTeralexiHome(), TERALEXI_DB_DIRNAME)
  ensureDir(dir)
  return dir
}

export function getTeralexiDbPath(): string {
  const path = join(getTeralexiDbDir(), TERALEXI_DB_FILENAME)
  ensureParentDirForFile(path)
  return path
}

export function getTeralexiWorkspacePath(): string {
  const dir = join(getTeralexiHome(), 'workspace')
  ensureDir(dir)
  return dir
}

/** `~/.teralexi/channels` — WhatsApp auth, Telegram/Discord/Slack/WeChat data. */
export function getTeralexiChannelsDir(): string {
  const dir = join(getTeralexiHome(), 'channels')
  ensureDir(dir)
  return dir
}

function getTeralexiChannelDataDir(
  name: (typeof TERALEXI_CHANNEL_DATA_DIRS)[number],
): string {
  const dir = join(getTeralexiChannelsDir(), name)
  ensureDir(dir)
  return dir
}

/** Per-run and per-conversation agent sandboxes (`<root>/skills`, `output/`, etc.). */
export function getTeralexiSandboxDir(): string {
  const dir = join(getTeralexiWorkspacePath(), 'sandbox')
  ensureDir(dir)
  return dir
}

export function getTeralexiAccountsDir(): string {
  const dir = join(getTeralexiHome(), 'accounts')
  ensureDir(dir)
  return dir
}

export function getTeralexiWhatsAppAuthDir(): string {
  return getTeralexiChannelDataDir('whatsapp-auth')
}

export function getTeralexiTelegramDataDir(): string {
  return getTeralexiChannelDataDir('telegram-data')
}

export function getTeralexiDiscordDataDir(): string {
  return getTeralexiChannelDataDir('discord-data')
}

export function getTeralexiWeChatDataDir(): string {
  return getTeralexiChannelDataDir('wechat-data')
}

export function getTeralexiSlackDataDir(): string {
  return getTeralexiChannelDataDir('slack-data')
}

export function getTeralexiSkillsDir(): string {
  const dir = join(getTeralexiHome(), 'skills')
  ensureDir(dir)
  return dir
}

/** User overrides for shared tools (`~/.teralexi/toolSet`). */
export function getTeralexiToolSetDir(): string {
  const dir = join(getTeralexiHome(), 'toolSet')
  ensureDir(dir)
  return dir
}

/** User-defined workflow folders (`~/.teralexi/workflows`). */
export function getTeralexiWorkflowsDir(): string {
  const dir = join(getTeralexiHome(), 'workflows')
  ensureDir(dir)
  return dir
}

/** User project rules (`~/.teralexi/rules`). Workspace rules live in `<project>/.teralexi/rules/`. */
export function getTeralexiRulesDir(): string {
  const dir = join(getTeralexiHome(), 'rules')
  ensureDir(dir)
  return dir
}

export function getWorkflowSourceDir(workflowId: string): string {
  const dir = join(getTeralexiWorkflowsDir(), workflowId, 'source')
  ensureDir(dir)
  return dir
}

export function getWorkflowSandboxDir(workflowId: string, runId: string): string {
  const dir = join(getTeralexiWorkflowsDir(), workflowId, 'runs', runId)
  ensureDir(dir)
  return dir
}

export function getTeralexiLogsDir(): string {
  const dir = join(getTeralexiHome(), 'logs')
  ensureDir(dir)
  return dir
}

export function getTeralexiAgentLogsDir(): string {
  const dir = join(getTeralexiLogsDir(), 'agents')
  ensureDir(dir)
  return dir
}

/** Root for per-agent memory (`block`, `session`, `persona` under each agent id). */
export function getTeralexiMemoryDir(): string {
  const dir = join(getTeralexiHome(), 'memory')
  ensureDir(dir)
  return dir
}

/** SQLite database for vector memory records under `~/.teralexi/memory/`. */
export function getTeralexiMemoryVectorsDbPath(): string {
  const path = join(getTeralexiMemoryDir(), TERALEXI_MEMORY_VECTORS_DB_FILENAME)
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

/** `~/.teralexi/memory/<agent-id>/{block,session}` (persona is global under `users/`). */
export function getAgentMemoryDirs(agentId: string): AgentMemoryDirs {
  const root = join(getTeralexiMemoryDir(), sanitizeAgentIdForPath(agentId))
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
 * `~/.teralexi/memory/users/<user-id>/persona/profile.json`
 */
export function resolveGlobalPersonaSnapshotPath(userId: string): string {
  return join(
    getTeralexiMemoryDir(),
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
    getTeralexiMemoryDir(),
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
 * Creates `~/.teralexi/` and standard subdirectories on first use.
 * Electron `userData` stays at the default OS location for Chromium internals.
 */
export function initializeTeralexiHome(app?: ElectronAppLike | null): string {
  const home = resolve(resolveTeralexiHomePath())

  if (initialized) {
    return teralexiHomePath ?? home
  }

  teralexiHomePath = home
  initialized = true

  ensureDir(home)
  for (const dir of TERALEXI_APP_DIRS) {
    ensureDir(join(home, dir))
  }
  ensureDir(join(home, 'workspace', 'sandbox'))

  for (const name of TERALEXI_CHANNEL_DATA_DIRS) {
    ensureDir(join(home, 'channels', name))
  }

  return home
}

export function isTeralexiHomeInitialized(): boolean {
  return initialized
}

/** Default Electron userData path for a given app name. */
export function guessDefaultElectronUserData(appName = 'teralexi'): string {
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
