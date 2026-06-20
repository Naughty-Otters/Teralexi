import { createHash, randomUUID } from 'node:crypto'
import {
  copySync,
  emptyDirSync,
  ensureDirSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { arch, platform, release } from 'node:os'
import AdmZip from 'adm-zip'
import {
  getAgentMemoryDirs,
  getopenfdeAgentLogsDir,
  getopenfdeConfigPropertiesPath,
  getopenfdeLogsDir,
} from '@config/openfde-home'
import { AGENT_DEFAULTS } from '@main/agent/config/constants'
import { loadAllMemoryBlocksForConversation, loadSessionMemorySnapshot } from '@main/agent/memory/agent-memory-store'
import { resolveAppVersion } from '@main/config/app-version'
import { getConversationStore } from '@main/services/conversation-store'
import type { StoredMcpServer } from '@main/services/conversation-store/types'
import type { SupportBundleManifest, SupportReportOptions } from '@shared/support-bundle'
import { redactPropertiesFile, redactRecord } from '@shared/support-redact'
import { createLogger } from '@main/logger'
import { app } from 'electron'
import { getSupportMaxBundleBytes } from './support-config'
import { readSupportEventsFile } from './support-event-store'

const log = createLogger('services.support-bundle-builder')

const MAIN_LOG_TAIL_BYTES = 2 * 1024 * 1024
const MAX_AGENT_LOG_FILES = 8

export type BuiltSupportBundle = {
  reportId: string
  zipPath: string
  sizeBytes: number
  manifest: SupportBundleManifest
}

function tailFileBytes(path: string, maxBytes: number): Buffer {
  if (!existsSync(path)) return Buffer.alloc(0)
  const stat = statSync(path)
  const size = stat.size
  const start = Math.max(0, size - maxBytes)
  const fd = readFileSync(path)
  return fd.subarray(start)
}

function sanitizeMcpForExport(servers: StoredMcpServer[]) {
  return servers.map((server) => ({
    ...server,
    env: redactRecord(server.env ?? {}),
    headers: redactRecord(server.headers ?? {}),
  }))
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function copyDirectoryWithBudget(
  sourceDir: string,
  destDir: string,
  budgetBytes: number,
): number {
  if (!existsSync(sourceDir)) return 0
  let used = 0
  const walk = (current: string, destRoot: string) => {
    if (used >= budgetBytes) return
    const entries = readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      if (used >= budgetBytes) return
      const srcPath = join(current, entry.name)
      const rel = relative(sourceDir, srcPath)
      const dstPath = join(destRoot, rel)
      if (entry.isDirectory()) {
        mkdirSync(dstPath, { recursive: true })
        walk(srcPath, destRoot)
        continue
      }
      if (!entry.isFile()) continue
      const size = statSync(srcPath).size
      if (used + size > budgetBytes) continue
      mkdirSync(dirname(dstPath), { recursive: true })
      copySync(srcPath, dstPath)
      used += size
    }
  }
  mkdirSync(destDir, { recursive: true })
  walk(sourceDir, destDir)
  return used
}

function collectAgentLogs(
  stagingDir: string,
  conversationId?: string | null,
): void {
  const logsDir = getopenfdeAgentLogsDir()
  if (!existsSync(logsDir)) return
  const dest = join(stagingDir, 'logs', 'agents')
  mkdirSync(dest, { recursive: true })

  const files = readdirSync(logsDir)
    .filter((name) => name.endsWith('.log'))
    .map((name) => ({
      name,
      path: join(logsDir, name),
      mtime: statSync(join(logsDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)

  const needle = conversationId?.trim()
  const matched = needle
    ? files.filter((file) => file.name.includes(needle))
    : []
  const selected = (matched.length > 0 ? matched : files).slice(0, MAX_AGENT_LOG_FILES)

  for (const file of selected) {
    copySync(file.path, join(dest, file.name))
  }
}

function collectMemory(
  stagingDir: string,
  agentId: string,
  conversationId: string,
): void {
  const memoryDir = join(stagingDir, 'memory')
  mkdirSync(memoryDir, { recursive: true })

  const session = loadSessionMemorySnapshot(agentId, conversationId)
  if (session) {
    writeJson(join(memoryDir, 'session.json'), session)
  }

  const blocks = loadAllMemoryBlocksForConversation(agentId, conversationId)
  if (blocks.length > 0) {
    writeJson(join(memoryDir, 'blocks.json'), blocks)
  }

  const { block, session: sessionDir } = getAgentMemoryDirs(agentId)
  const prefix = `${conversationId.trim()}_`
  if (existsSync(block)) {
    const blockOut = join(memoryDir, 'block-files')
    mkdirSync(blockOut, { recursive: true })
    for (const name of readdirSync(block)) {
      if (name.startsWith(prefix) && name.endsWith('.json')) {
        copySync(join(block, name), join(blockOut, name))
      }
    }
  }
  const sessionFile = join(sessionDir, `${conversationId.trim()}.json`)
  if (existsSync(sessionFile)) {
    copySync(sessionFile, join(memoryDir, basename(sessionFile)))
  }
}

export async function buildSupportBundle(
  options: SupportReportOptions,
): Promise<BuiltSupportBundle> {
  const reportId = randomUUID()
  const comments = options.comments.trim()
  if (!comments) {
    throw new Error('Comments are required to submit a support report.')
  }

  const conversationId = options.conversationId?.trim() || undefined
  const agentId =
    options.agentId?.trim() ||
    (conversationId
      ? getConversationStore().getConversation(conversationId)?.agentId
      : undefined)

  const includeSandbox = options.includeSandbox === true
  const includeMemory = options.includeMemory !== false

  const bundleRoot = join(getopenfdeLogsDir(), 'support-bundles')
  const stagingDir = join(bundleRoot, reportId)
  emptyDirSync(stagingDir)
  ensureDirSync(stagingDir)

  const userId = AGENT_DEFAULTS.USER_ID
  const store = getConversationStore()

  writeFileSync(join(stagingDir, 'user-comment.txt'), `${comments}\n`, 'utf8')

  const eventsRaw = readSupportEventsFile()
  writeFileSync(
    join(stagingDir, 'errors.jsonl'),
    eventsRaw || '',
    'utf8',
  )

  writeJson(join(stagingDir, 'system.json'), {
    platform: platform(),
    release: release(),
    arch: arch(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
  })

  mkdirSync(join(stagingDir, 'settings'), { recursive: true })
  const configPath = getopenfdeConfigPropertiesPath()
  if (existsSync(configPath)) {
    const redacted = redactPropertiesFile(readFileSync(configPath, 'utf8'))
    writeFileSync(
      join(stagingDir, 'settings', 'config.redacted.properties'),
      redacted,
      'utf8',
    )
  }

  writeJson(
    join(stagingDir, 'settings', 'user-properties.json'),
    redactRecord(store.getUserPropertiesMap(userId)),
  )
  writeJson(
    join(stagingDir, 'settings', 'mcp-servers.json'),
    sanitizeMcpForExport(store.listMcpServers(userId)),
  )
  writeJson(
    join(stagingDir, 'settings', 'agent-configurations.json'),
    store.listAgentConfigurations(userId),
  )

  if (conversationId) {
    const convDir = join(stagingDir, 'conversations')
    mkdirSync(convDir, { recursive: true })
    writeJson(join(convDir, `${conversationId}.json`), {
      conversation: store.getConversation(conversationId),
      settings: store.getConversationSettings(conversationId),
      messages: store.getMessages(conversationId),
      sandboxRuns: store.listSandboxRunsForConversation(conversationId),
    })
  }

  if (includeMemory && agentId && conversationId) {
    collectMemory(stagingDir, agentId, conversationId)
  }

  mkdirSync(join(stagingDir, 'logs'), { recursive: true })
  const mainLogPath = join(getopenfdeLogsDir(), 'main.log')
  writeFileSync(
    join(stagingDir, 'logs', 'main.log.tail'),
    tailFileBytes(mainLogPath, MAIN_LOG_TAIL_BYTES),
  )
  collectAgentLogs(stagingDir, conversationId)

  if (includeSandbox && conversationId) {
    const sandboxBudget = Math.floor(getSupportMaxBundleBytes() * 0.5)
    const roots = store.listSandboxRootsForConversation(conversationId)
    const sandboxOut = join(stagingDir, 'sandbox')
    mkdirSync(sandboxOut, { recursive: true })
    let remaining = sandboxBudget
    for (const root of roots) {
      if (remaining <= 0) break
      if (!existsSync(root)) continue
      const folderName = basename(root)
      const used = copyDirectoryWithBudget(
        root,
        join(sandboxOut, folderName),
        remaining,
      )
      remaining -= used
    }
  }

  const manifest: SupportBundleManifest = {
    reportId,
    createdAt: new Date().toISOString(),
    appVersion: resolveAppVersion(),
    platform: platform(),
    arch: arch(),
    electronVersion: process.versions.electron ?? '',
    isPackaged: app.isPackaged,
    conversationId,
    agentId,
    comments,
    includeSandbox,
    includeMemory,
  }

  writeJson(join(stagingDir, 'manifest.json'), manifest)

  const zipPath = join(bundleRoot, `openfde-support-${reportId}.zip`)
  const zip = new AdmZip()
  zip.addLocalFolder(stagingDir, '')
  zip.writeZip(zipPath)

  manifest.bundleSha256 = createHash('sha256')
    .update(readFileSync(zipPath))
    .digest('hex')

  const sizeBytes = statSync(zipPath).size
  if (sizeBytes > getSupportMaxBundleBytes()) {
    log.warn('Support bundle exceeds configured max size', {
      sizeBytes,
      maxBytes: getSupportMaxBundleBytes(),
    })
  }

  log.info('Support bundle built', { reportId, zipPath, sizeBytes })
  return { reportId, zipPath, sizeBytes, manifest }
}
