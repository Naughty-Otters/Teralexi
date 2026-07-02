import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import {
  getEnvOverrides,
  initializeEnvOverrides,
} from './env-overrides'
import { getopenfdeConfigDir, getopenfdeConfigPropertiesPath } from './openfde-home'
import {
  CONFIG_PROPERTIES_FILENAME,
  isValidSystemPropKey,
} from './system-prop-keys'

export { isValidSystemPropKey, CONFIG_PROPERTIES_FILENAME } from './system-prop-keys'

const DEFAULT_SYSTEM_PROPERTIES: Record<string, string> = {
  'app.build.hotPublishUrl': '',
  'app.build.hotPublishConfigName': 'update-config',
  'app.dev.removeElectronJunk': 'true',
  'app.dev.chineseLog': 'false',
  'app.dev.port': '9080',
  'app.google.workspace.clientId': '',
  'app.google.workspace.clientSecret': '',
  'app.google.clientId': '',
  'app.google.clientSecret': '',
  'app.github.clientId': '',
  'app.github.clientSecret': '',
  'app.paths.dllFolder': '',
  'app.paths.hotUpdateFolder': 'update',
  'app.window.useStartupChart': 'true',
  'app.window.useSystemTitle': 'false',
  'settings.whatsapp.botName': 'OpenFDE WhatsApp Bot',
  'settings.whatsapp.targetPhone': '',
  'settings.telegram.botToken': '',
  'settings.telegram.botName': 'OpenFDE Telegram Bot',
  'settings.discord.botToken': '',
  'settings.discord.botName': 'OpenFDE Discord Bot',
  'settings.wechat.corpId': '',
  'settings.wechat.corpSecret': '',
  'settings.wechat.agentId': '',
  'settings.wechat.botName': 'OpenFDE WeChat Bot',
  'settings.slack.botToken': '',
  'settings.slack.appToken': '',
  'settings.slack.botName': 'OpenFDE Slack Bot',
  'memory.recording.block': 'true',
  'memory.recording.vector': 'false',
  'memory.recording.session': 'true',
  'memory.recording.persona': 'true',
  'memory.retention.blocksPerAgent': '5',
  'memory.retention.sessionsPerAgent': '5',
  'memory.retention.sessionsForAgentPersona': '5',
  'editor.settings.formatOnSave': 'false',
  'editor.settings.tabSize': '2',
  'editor.settings.insertSpaces': 'true',
  'editor.settings.eslintEnabled': 'true',
  'editor.settings.eslintDebounceMs': '500',
  'editor.settings.aiCompletionEnabled': 'false',
  'editor.settings.aiCompletionProvider': 'ollama',
  'editor.settings.aiCompletionModel': '',
  'editor.settings.aiCompletionDebounceMs': '500',
  'editor.settings.aiCompletionMaxTokens': '128',
  'app.support.uploadUrl': '',
  'app.support.maxMegabytes': '100',
  'app.support.maxUploadsPerDay': '5',
  'app.support.uploadCooldownMinutes': '10',
  'app.desktop.releasesUrl': '',
  'app.desktop.forceDevUpdateConfig': 'false',
  'app.base.apiUrl': '',
  'app.client.id': '',
  'app.metrics.graphqlUrl': '',
  'app.ui.locale': 'en',
  'app.ui.appearance': 'solid',
}

/** Loaded from env files only — not written to user config.properties. */
export const ENV_ONLY_PROPERTY_KEYS = [
  'app.base.apiUrl',
  'app.openfde.googleAuthLoginUrl',
  'app.desktop.forceDevUpdateConfig',
] as const

const ENV_ONLY_PROPERTY_KEY_SET = new Set<string>(ENV_ONLY_PROPERTY_KEYS)

function stripEnvOnlyKeys(entries: Map<string, string>): void {
  for (const key of ENV_ONLY_PROPERTY_KEYS) {
    entries.delete(key)
  }
}

export const SYSTEM_PROPERTY_KEYS = [
  ...Object.keys(DEFAULT_SYSTEM_PROPERTIES),
  ...ENV_ONLY_PROPERTY_KEYS,
] as string[]

function ensureEnvOverridesLoaded(): void {
  initializeEnvOverrides(SYSTEM_PROPERTY_KEYS)
}

function getSystemPropPath(): string {
  return getopenfdeConfigPropertiesPath()
}

function parseSystemProp(content: string): Map<string, string> {
  const entries = new Map<string, string>()
  const lines = content.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex <= 0) continue
    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    if (!key) continue
    entries.set(key, value)
  }
  return entries
}

function stringifySystemProp(entries: Map<string, string>): string {
  const sorted = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b))
  return sorted.map(([key, value]) => `${key}=${value}`).join('\n') + '\n'
}

function readConfigProperties(): Map<string, string> {
  const filePath = getSystemPropPath()
  if (!existsSync(filePath)) {
    return new Map(Object.entries(DEFAULT_SYSTEM_PROPERTIES))
  }
  const content = readFileSync(filePath, 'utf-8')
  const parsed = parseSystemProp(content)
  for (const [key, defaultValue] of Object.entries(DEFAULT_SYSTEM_PROPERTIES)) {
    if (!parsed.has(key)) parsed.set(key, defaultValue)
  }
  return parsed
}

function resolveAllProps(): Map<string, string> {
  ensureEnvOverridesLoaded()
  const merged = readConfigProperties()
  stripEnvOnlyKeys(merged)
  for (const [key, value] of getEnvOverrides()) {
    if (!isValidSystemPropKey(key)) continue
    if (value !== '') merged.set(key, value)
  }
  return merged
}

function writeAllProps(entries: Map<string, string>): void {
  const filePath = getSystemPropPath()
  const persisted = new Map(entries)
  stripEnvOnlyKeys(persisted)
  mkdirSync(getopenfdeConfigDir(), { recursive: true })
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, stringifySystemProp(persisted), 'utf-8')
}

export function ensureSystemPropFile(): string {
  const merged = readConfigProperties()
  stripEnvOnlyKeys(merged)
  writeAllProps(merged)
  return getSystemPropPath()
}

export function getSystemPropValue(key: string, defaultValue = ''): string {
  const merged = resolveAllProps()
  return merged.get(key) ?? defaultValue
}

export function getSystemPropValues(keys?: string[]): Record<string, string> {
  const merged = resolveAllProps()
  if (!keys || keys.length === 0) {
    return Object.fromEntries(merged.entries())
  }

  const picked: Record<string, string> = {}
  for (const key of keys) {
    if (merged.has(key)) picked[key] = merged.get(key) || ''
  }
  return picked
}

export function setSystemPropValue(
  key: string,
  value: string | number | boolean,
): void {
  if (!isValidSystemPropKey(key)) {
    throw new Error(`Invalid config.properties key format: ${key}`)
  }
  if (ENV_ONLY_PROPERTY_KEY_SET.has(key)) {
    throw new Error(
      `${key} is baked at build time and cannot be saved to config.properties`,
    )
  }

  const merged = readConfigProperties()
  stripEnvOnlyKeys(merged)
  merged.set(key, String(value))
  writeAllProps(merged)
}

export function getSystemPropFilePath(): string {
  return getSystemPropPath()
}
