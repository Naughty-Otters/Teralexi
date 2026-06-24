import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { getopenfdeConfigDir, getopenfdeSystemPropPath } from './openfde-home'

export const CONFIG_PROPERTIES_FILENAME = 'config.properties'
/** @deprecated Use {@link CONFIG_PROPERTIES_FILENAME} */
export const SYSTEM_PROP_FILENAME = CONFIG_PROPERTIES_FILENAME
export const LEGACY_SYSTEM_PROP_FILENAME = 'system.prop'
export const SYSTEM_PROP_DIRNAME = 'config'

const DEFAULT_SYSTEM_PROPERTIES: Record<string, string> = {
  'app.build.hotPublishUrl': '',
  'app.build.hotPublishConfigName': 'update-config',
  'app.dev.removeElectronJunk': 'true',
  'app.dev.chineseLog': 'false',
  'app.dev.port': '9080',
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
  'app.support.uploadUrl': '',
  'app.support.maxMegabytes': '100',
  'app.ui.locale': 'en',
  'app.ui.appearance': 'solid',
}

function getSystemPropPath(): string {
  return getopenfdeSystemPropPath()
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

function readAllProps(): Map<string, string> {
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

function writeAllProps(entries: Map<string, string>): void {
  const filePath = getSystemPropPath()
  mkdirSync(getopenfdeConfigDir(), { recursive: true })
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, stringifySystemProp(entries), 'utf-8')
}

export function isValidSystemPropKey(key: string): boolean {
  return /^\w+\.\w+\.\w+$/.test(key)
}

export function ensureSystemPropFile(): string {
  const merged = readAllProps()
  writeAllProps(merged)
  return getSystemPropPath()
}

export function getSystemPropValue(key: string, defaultValue = ''): string {
  const merged = readAllProps()
  return merged.get(key) ?? defaultValue
}

export function getSystemPropValues(keys?: string[]): Record<string, string> {
  const merged = readAllProps()
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

  const merged = readAllProps()
  merged.set(key, String(value))
  writeAllProps(merged)
}

export function getSystemPropFilePath(): string {
  return getSystemPropPath()
}
