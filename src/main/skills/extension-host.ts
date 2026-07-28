import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalizeExtensionHooksFile,
  normalizeManifestHooks,
  normalizeModuleHooks,
} from '@main/agent/hooks/hook-binding-normalizer'
import { createLogger } from '@main/logger'
import type { RunnableHookBinding } from '@shared/agent/hooks'
import {
  computeContentHash,
  computeHookTrustKey,
  type HookTrustStatus,
} from '@main/services/conversation-store/extension-hook-trust-repository'
import { getConversationStore } from '@main/services/conversation-store'
import { EXTENSION_FILES } from './constants'
import { listExtensions, type LoadedExtension } from './extensions-directory-loader'
import {
  clearExtensionContributions,
  listExtensionChannelSummaries,
  listExtensionLlmProviders,
  listExtensionUiPanelSummaries,
  registerExtensionContributions,
} from './extension-contributions-registry'
import {
  collectContributionsFromModule,
  collectHooksFromModule,
  loadExtensionActionsModule,
  loadExtensionHookExport,
} from './skill-module-loader'

const log = createLogger('skills.extension-host')

const EXTENSION_ROOT_PLACEHOLDER = '${EXTENSION_ROOT}'

async function resolveFunctionRefBindings(
  bindings: RunnableHookBinding[],
  extensionDir: string,
): Promise<RunnableHookBinding[]> {
  const out: RunnableHookBinding[] = []
  for (const binding of bindings) {
    if (binding.type !== 'function-ref') {
      out.push(binding)
      continue
    }
    const handler = await loadExtensionHookExport(
      extensionDir,
      binding.module,
      binding.export,
    )
    if (!handler) {
      log.warn('Failed to resolve function hook export', {
        module: binding.module,
        export: binding.export,
      })
      continue
    }
    out.push({
      type: 'function',
      event: binding.event,
      handler,
      source: binding.source,
      extensionId: binding.extensionId,
      trustKey: binding.trustKey,
      enabled: binding.enabled,
    })
  }
  return out
}

function substituteBindingPaths(
  bindings: RunnableHookBinding[],
  extensionDir: string,
): RunnableHookBinding[] {
  return bindings.map((binding) => {
    if (binding.type === 'command') {
      return {
        ...binding,
        command: substituteExtensionRoot(binding.command, extensionDir),
      }
    }
    if (binding.type === 'function-ref') {
      return {
        ...binding,
        module: substituteExtensionRoot(binding.module, extensionDir),
      }
    }
    return binding
  })
}

type ExtensionHostCache = {
  userId: string
  workspacePath?: string
  bindings: RunnableHookBinding[]
  extensionRoots: Map<string, string>
  pendingTrust: PendingHookReview[]
}

export type PendingHookReview = {
  extensionId: string
  trustKey: string
  contentHash: string
  sourcePath: string
  events: string[]
  status: HookTrustStatus
}

let hostCache: ExtensionHostCache | null = null
/** Dedupes concurrent rebuilds so enable/trust reload races don't wipe contributions. */
let hostCacheBuild: Promise<ExtensionHostCache> | null = null
let hostCacheBuildKey: string | null = null

function hostCacheKey(userId: string, workspacePath?: string): string {
  return `${userId}::${workspacePath ?? ''}`
}

/**
 * Expand `${EXTENSION_ROOT}/rel/path` with host separators. Trailing args
 * (whitespace-delimited) are preserved so command strings stay runnable.
 */
function substituteExtensionRoot(value: string, extensionDir: string): string {
  if (!value.includes(EXTENSION_ROOT_PLACEHOLDER)) return value
  return value.replace(
    /\$\{EXTENSION_ROOT\}((?:[/\\][^\s"'`;|&]+)*)/g,
    (_match, relWithSeps: string) => {
      if (!relWithSeps) return extensionDir
      const segments = relWithSeps.split(/[/\\]+/).filter(Boolean)
      return join(extensionDir, ...segments)
    },
  )
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    log.warn('Failed to read extension hook file', { path, err })
    return null
  }
}

async function collectExtensionBindings(
  ext: LoadedExtension,
  userId: string,
  disabledIds: Set<string>,
): Promise<{ bindings: RunnableHookBinding[]; pending: PendingHookReview[] }> {
  if (!getConversationStore().isExtensionEnabledInMap(disabledIds, ext.id)) {
    return { bindings: [], pending: [] }
  }

  const bindings: RunnableHookBinding[] = []
  const pending: PendingHookReview[] = []
  const trustRepo = getConversationStore().getExtensionHookTrustRepository()

  const manifestHooks = ext.manifest.contributes?.hooks
  if (manifestHooks && Object.keys(manifestHooks).length > 0) {
    const content = JSON.stringify(manifestHooks)
    const contentHash = computeContentHash(content)
    const sourcePath = 'extension.json#contributes.hooks'
    const trustKey = computeHookTrustKey(ext.id, sourcePath, contentHash)
    const status = trustRepo.getStatus(userId, trustKey, contentHash)
    if (status === 'trusted') {
      const normalized = substituteBindingPaths(
        normalizeManifestHooks(
          manifestHooks,
          'extension-manifest',
          ext.id,
          trustKey,
        ),
        ext.dir,
      )
      bindings.push(
        ...(await resolveFunctionRefBindings(normalized, ext.dir)).map((binding) => ({
          ...binding,
          trustKey,
        })),
      )
    } else {
      pending.push({
        extensionId: ext.id,
        trustKey,
        contentHash,
        sourcePath,
        events: Object.keys(manifestHooks),
        status,
      })
    }
  }

  const hooksJsonPath = join(ext.dir, EXTENSION_FILES.HOOKS_JSON)
  if (existsSync(hooksJsonPath)) {
    const raw = readFileSync(hooksJsonPath, 'utf-8')
    const contentHash = computeContentHash(raw)
    const sourcePath = EXTENSION_FILES.HOOKS_JSON
    const trustKey = computeHookTrustKey(ext.id, sourcePath, contentHash)
    const status = trustRepo.getStatus(userId, trustKey, contentHash)
    if (status === 'trusted') {
      const parsed = readJsonFile(hooksJsonPath)
      const normalized = substituteBindingPaths(
        normalizeExtensionHooksFile(
          parsed,
          'extension-hooks-json',
          ext.id,
          trustKey,
        ),
        ext.dir,
      )
      bindings.push(
        ...(await resolveFunctionRefBindings(normalized, ext.dir)).map((binding) => ({
          ...binding,
          trustKey,
        })),
      )
    } else {
      const parsed = readJsonFile(hooksJsonPath)
      const events = extractHookEventsFromFile(parsed)
      pending.push({
        extensionId: ext.id,
        trustKey,
        contentHash,
        sourcePath,
        events,
        status,
      })
    }
  }

  const actionsModule = await loadExtensionActionsModule(ext.dir)
  if (actionsModule) {
    const hooks = collectHooksFromModule(actionsModule)
    const contributions = collectContributionsFromModule(actionsModule)
    const content = JSON.stringify({
      hooks: Object.keys(hooks).sort(),
      channels: Object.keys(contributions.channels ?? {}).sort(),
      llmProviders: Object.keys(contributions.llmProviders ?? {}).sort(),
      uiPanels: Object.keys(contributions.uiPanels ?? {}).sort(),
    })
    const contentHash = computeContentHash(`${ext.id}:module:${content}`)
    const sourcePath = 'actions/index.ts'
    const trustKey = computeHookTrustKey(ext.id, sourcePath, contentHash)
    const status = trustRepo.getStatus(userId, trustKey, contentHash)
    if (status === 'trusted') {
      bindings.push(
        ...normalizeModuleHooks(hooks, 'extension-module', ext.id, trustKey),
      )
      registerExtensionContributions({
        extensionId: ext.id,
        extensionDir: ext.dir,
        ...contributions,
      })
    } else if (
      Object.keys(hooks).length > 0 ||
      Object.keys(contributions.channels ?? {}).length > 0 ||
      Object.keys(contributions.llmProviders ?? {}).length > 0 ||
      Object.keys(contributions.uiPanels ?? {}).length > 0
    ) {
      pending.push({
        extensionId: ext.id,
        trustKey,
        contentHash,
        sourcePath,
        events: Object.keys(hooks),
        status,
      })
    }
  }

  return { bindings, pending }
}

function extractHookEventsFromFile(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return []
  const hooksRaw = (raw as { hooks?: unknown }).hooks
  if (Array.isArray(hooksRaw)) {
    return hooksRaw
      .map((item) =>
        item && typeof item === 'object'
          ? String((item as { event?: string }).event ?? '')
          : '',
      )
      .filter(Boolean)
  }
  if (hooksRaw && typeof hooksRaw === 'object') {
    return Object.keys(hooksRaw)
  }
  return []
}

async function buildHostCache(
  userId: string,
  workspacePath?: string,
): Promise<ExtensionHostCache> {
  clearExtensionContributions()
  const store = getConversationStore()
  const disabledIds = store.listDisabledExtensionIds(userId)
  const extensions = listExtensions(workspacePath)
  const bindings: RunnableHookBinding[] = []
  const pendingTrust: PendingHookReview[] = []
  const extensionRoots = new Map<string, string>()

  const collectedPerExtension = await Promise.all(
    extensions.map(async (ext) => {
      try {
        return await collectExtensionBindings(ext, userId, disabledIds)
      } catch (err) {
        log.warn('Failed to collect extension bindings; skipping extension', {
          extensionId: ext.id,
          err,
        })
        return { bindings: [] as RunnableHookBinding[], pending: [] as PendingHookReview[] }
      }
    }),
  )
  for (const ext of extensions) {
    extensionRoots.set(ext.id, ext.dir)
  }
  for (const collected of collectedPerExtension) {
    bindings.push(...collected.bindings)
    pendingTrust.push(...collected.pending)
  }

  return {
    userId,
    workspacePath,
    bindings,
    extensionRoots,
    pendingTrust,
  }
}

export function clearExtensionHostCache(): void {
  hostCache = null
  hostCacheBuild = null
  hostCacheBuildKey = null
  clearExtensionContributions()
}

/** Load extension hooks and contributions on first use (lazy). */
export async function ensureExtensionHostInitialized(
  userId: string,
  workspacePath?: string,
): Promise<void> {
  await ensureHostCache(userId, workspacePath)
}

export async function initExtensionHost(
  userId: string,
  workspacePath?: string,
): Promise<void> {
  await ensureExtensionHostInitialized(userId, workspacePath)
}

export async function reloadExtensionHost(
  userId: string,
  workspacePath?: string,
): Promise<void> {
  hostCache = null
  hostCacheBuild = null
  hostCacheBuildKey = null
  try {
    await ensureExtensionHostInitialized(userId, workspacePath)
  } catch (err) {
    log.warn('Extension host reload failed', { userId, workspacePath, err })
  }
}

async function ensureHostCache(
  userId: string,
  workspacePath?: string,
): Promise<ExtensionHostCache> {
  if (
    hostCache &&
    hostCache.userId === userId &&
    hostCache.workspacePath === workspacePath
  ) {
    return hostCache
  }

  const key = hostCacheKey(userId, workspacePath)
  if (hostCacheBuild && hostCacheBuildKey === key) {
    return hostCacheBuild
  }

  const buildPromise = buildHostCache(userId, workspacePath)
  hostCacheBuild = buildPromise
  hostCacheBuildKey = key
  try {
    hostCache = await buildPromise
    return hostCache
  } finally {
    if (hostCacheBuild === buildPromise) {
      hostCacheBuild = null
      hostCacheBuildKey = null
    }
  }
}

export async function getExtensionHookBindings(
  userId: string,
  workspacePath?: string,
): Promise<RunnableHookBinding[]> {
  const cache = await ensureHostCache(userId, workspacePath)
  return cache.bindings
}

export function getExtensionRoot(extensionId: string): string | undefined {
  return hostCache?.extensionRoots.get(extensionId)
}

export async function listPendingHookReviews(
  userId: string,
  workspacePath?: string,
): Promise<PendingHookReview[]> {
  const cache = await ensureHostCache(userId, workspacePath)
  return cache.pendingTrust
}

/**
 * Returns pending reviews from an already-built host cache only.
 * Does not trigger actions/esbuild loading — safe for Settings list UI.
 */
export function peekPendingHookReviews(
  userId: string,
  workspacePath?: string,
): PendingHookReview[] | null {
  if (
    hostCache &&
    hostCache.userId === userId &&
    hostCache.workspacePath === workspacePath
  ) {
    return hostCache.pendingTrust
  }
  return null
}

export function registerPendingHookTrust(
  userId: string,
  reviews: PendingHookReview[],
): void {
  const trustRepo = getConversationStore().getExtensionHookTrustRepository()
  for (const review of reviews) {
    const existing = trustRepo.getStatus(userId, review.trustKey, review.contentHash)
    if (existing === 'trusted' || existing === 'rejected') continue
    trustRepo.setStatus(userId, review.trustKey, review.contentHash, 'pending')
  }
}

const conversationHookContext = new Map<string, string[]>()

export function appendConversationHookContext(
  conversationId: string,
  context: string | undefined,
): void {
  if (!conversationId || !context?.trim()) return
  const existing = conversationHookContext.get(conversationId) ?? []
  existing.push(context.trim())
  conversationHookContext.set(conversationId, existing)
}

export function consumeConversationHookContext(conversationId: string): string[] {
  const existing = conversationHookContext.get(conversationId) ?? []
  conversationHookContext.delete(conversationId)
  return existing
}

export async function listExtensionChannels(
  userId: string,
  workspacePath?: string,
) {
  await ensureHostCache(userId, workspacePath)
  return listExtensionChannelSummaries()
}

export async function listExtensionUiPanels(
  userId: string,
  workspacePath?: string,
) {
  await ensureHostCache(userId, workspacePath)
  return listExtensionUiPanelSummaries()
}

export async function listExtensionLlmProviderSummaries(
  userId: string,
  workspacePath?: string,
) {
  await ensureHostCache(userId, workspacePath)
  return listExtensionLlmProviders()
}
