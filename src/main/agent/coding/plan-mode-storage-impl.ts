import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  emptyTodoList,
  parseTodoList,
  replaceTodos,
  type TodoList,
} from '@shared/agent/todos'
import { getTeralexiSandboxDir } from '@config/teralexi-home'
import { getSandboxRootFromEnv, remapLegacyPlanRelativePath } from '@toolSet/sandbox-paths'
import { peekSandboxRootForConversation } from '../sandbox/registry'
import { getAgentRunSandboxRoot } from '../sandbox/run-context'
import {
  renderPlanMarkdownFromTodoList,
  renderPlanModeMarkdown,
  planContextFromTodoList,
} from './plan-mode-template'
import { planModeFor } from './plan-mode-state-machine'

/** Co-located plan markdown + todos.json live under `<sandbox>/plans/`. */
export const PLAN_MODE_PLANS_DIR = 'plans'

/** @deprecated Legacy layout — migrated into {@link PLAN_MODE_PLANS_DIR}. */
export const LEGACY_PLAN_MODE_PLANS_DIR = 'output/plans'

export type ResolvedPlanFile = {
  absolutePath: string
  displayPath: string
  slug: string
}

export type PlanModeStoragePaths = {
  sandboxRoot: string
  plansDirAbs: string
  planFile: ResolvedPlanFile
  todosFile: {
    absolutePath: string
    displayPath: string
  }
  manifestFile: {
    absolutePath: string
    displayPath: string
  }
}

export type PlanModeStorageOptions = {
  sandboxRoot?: string | null
  slug?: string | null
}

export function stableSandboxRootForConversation(conversationId: string): string {
  const dirName = createHash('sha256')
    .update(conversationId.trim(), 'utf8')
    .digest('hex')
  return join(getTeralexiSandboxDir(), dirName)
}

/** Single resolver for the conversation sandbox root used by all plan-mode I/O. */
export function resolvePlanSandboxRoot(
  conversationId: string | undefined,
  options?: { sandboxRoot?: string | null },
): string | null {
  const fromOpt = options?.sandboxRoot?.trim()
  if (fromOpt) return fromOpt

  const fromRun = getAgentRunSandboxRoot() || getSandboxRootFromEnv()
  if (fromRun) return fromRun

  const id = conversationId?.trim()
  if (!id) return null

  return peekSandboxRootForConversation(id) ?? stableSandboxRootForConversation(id)
}

export function planModeStorageOptionsFromEnv(
  conversationId?: string | null,
): PlanModeStorageOptions {
  const sandboxRoot = resolvePlanSandboxRoot(conversationId ?? undefined)
  return sandboxRoot ? { sandboxRoot } : {}
}

/** Normalize user/agent paths to canonical `plans/…` (maps legacy `output/plans/…`). */
export function normalizePlanModeRelativePath(userPath: string): string {
  return remapLegacyPlanRelativePath(userPath.replace(/\\/g, '/'))
}

function slugifyPlanTitle(raw: string): string {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'implementation-plan'
}

export function assignPlanSlug(
  conversationId: string,
  hint?: string,
  _options?: { updateFromHint?: boolean },
): string {
  const state = planModeFor(conversationId).snapshot()
  const existing = state.planSlug?.trim()
  if (existing) return existing

  const hinted = hint?.trim() ? slugifyPlanTitle(hint) : null
  const slug = hinted ?? 'implementation-plan'
  planModeFor(conversationId).assignPlanSlug(slug)
  return slug
}

/** Remove stray `plans/*.md` files so only the canonical plan markdown remains. */
export function pruneStalePlanMarkdownFiles(
  plansDirAbs: string,
  canonicalPlanAbs: string,
): void {
  if (!existsSync(plansDirAbs)) return
  const canonical = resolve(canonicalPlanAbs)
  let entries: string[]
  try {
    entries = readdirSync(plansDirAbs)
  } catch {
    return
  }
  for (const name of entries) {
    if (!name.endsWith('.md')) continue
    const abs = resolve(join(plansDirAbs, name))
    if (abs === canonical) continue
    try {
      unlinkSync(abs)
    } catch {
      // ignore unreadable or locked files
    }
  }
}

export function isCanonicalPlanMarkdownPath(
  storage: PlanModeStoragePaths,
  userPath: string,
): boolean {
  const norm = normalizePlanModeRelativePath(userPath).replace(/^\/+/, '')
  if (norm === storage.planFile.displayPath) return true
  try {
    return resolve(storage.sandboxRoot, norm) === resolve(storage.planFile.absolutePath)
  } catch {
    return false
  }
}

export function resolvePlanModeStorage(
  conversationId: string | undefined,
  options?: PlanModeStorageOptions,
): PlanModeStoragePaths | null {
  const id = conversationId?.trim()
  if (!id) return null

  const sandboxRoot = resolvePlanSandboxRoot(id, options)
  if (!sandboxRoot) return null

  const state = planModeFor(id).snapshot()
  const planSlug = (options?.slug ?? state.planSlug)?.trim()
  if (!planSlug) return null

  const plansDirAbs = join(sandboxRoot, PLAN_MODE_PLANS_DIR)
  const planAbs = join(plansDirAbs, `${planSlug}.md`)
  const todosAbs = join(plansDirAbs, 'todos.json')
  const manifestAbs = join(plansDirAbs, 'manifest.json')

  return {
    sandboxRoot,
    plansDirAbs,
    planFile: {
      absolutePath: planAbs,
      displayPath: `${PLAN_MODE_PLANS_DIR}/${planSlug}.md`,
      slug: planSlug,
    },
    todosFile: {
      absolutePath: todosAbs,
      displayPath: `${PLAN_MODE_PLANS_DIR}/todos.json`,
    },
    manifestFile: {
      absolutePath: manifestAbs,
      displayPath: `${PLAN_MODE_PLANS_DIR}/manifest.json`,
    },
  }
}

/** @deprecated Use {@link resolvePlanModeStorage} — kept for existing call sites. */
export function resolvePlanFilePath(
  conversationId: string,
  slug?: string | null,
  options?: { sandboxRoot?: string | null },
): ResolvedPlanFile | null {
  const storage = resolvePlanModeStorage(conversationId, { ...options, slug })
  return storage?.planFile ?? null
}

export function ensurePlanModePlansDir(plansDirAbs: string): void {
  if (!existsSync(plansDirAbs)) {
    mkdirSync(plansDirAbs, { recursive: true })
  }
}

/** @deprecated Use ensurePlanModePlansDir via bootstrap — kept for tests. */
export function ensurePlanFileDirectory(absolutePath: string): void {
  ensurePlanModePlansDir(join(absolutePath, '..'))
}

/** True when the plan file has at least one non-placeholder step. */
export function planMarkdownHasActionableSteps(content: string): boolean {
  return parsePlanStepsFromMarkdown(content).length > 0
}

export function parsePlanStepsFromMarkdown(content: string): string[] {
  const lines = content.split('\n')
  const steps: string[] = []
  let inSteps = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^##\s+steps/i.test(trimmed)) {
      inSteps = true
      continue
    }
    if (inSteps && /^##\s+/.test(trimmed)) break
    if (!inSteps) continue
    const m = trimmed.match(/^\d+\.\s+(.+)/)
    if (m?.[1]) {
      const step = m[1].replace(/<!--.*?-->/g, '').trim()
      if (step && !step.startsWith('<!--')) steps.push(step)
    }
  }
  return steps
}

export function isPlanFileWritten(absolutePath: string): boolean {
  if (!existsSync(absolutePath)) return false
  try {
    return planMarkdownHasActionableSteps(readFileSync(absolutePath, 'utf8'))
  } catch {
    return false
  }
}

function legacyPlansDirAbs(sandboxRoot: string): string {
  return join(sandboxRoot, 'output', 'plans')
}

function migrateLegacyPlanArtifacts(storage: PlanModeStoragePaths): void {
  const legacyDir = legacyPlansDirAbs(storage.sandboxRoot)
  if (!existsSync(legacyDir)) return

  ensurePlanModePlansDir(storage.plansDirAbs)

  const slug = storage.planFile.slug
  const legacyPlan = join(legacyDir, `${slug}.md`)
  const legacyTodos = join(legacyDir, 'todos.json')

  if (!existsSync(storage.planFile.absolutePath) && existsSync(legacyPlan)) {
    try {
      renameSync(legacyPlan, storage.planFile.absolutePath)
    } catch {
      copyFileSync(legacyPlan, storage.planFile.absolutePath)
    }
  }

  if (!existsSync(storage.todosFile.absolutePath) && existsSync(legacyTodos)) {
    try {
      renameSync(legacyTodos, storage.todosFile.absolutePath)
    } catch {
      copyFileSync(legacyTodos, storage.todosFile.absolutePath)
    }
  }
}

function readLegacySandboxTodoList(sandboxRoot: string): TodoList | null {
  const legacy = join(sandboxRoot, 'todos.json')
  if (!existsSync(legacy)) return null
  try {
    return parseTodoList(JSON.parse(readFileSync(legacy, 'utf8')))
  } catch {
    return null
  }
}

export function readPlanModeTodoList(
  conversationId: string,
  options?: PlanModeStorageOptions,
): TodoList {
  const storage = resolvePlanModeStorage(conversationId, options)
  if (!storage) return emptyTodoList()

  migrateLegacyPlanArtifacts(storage)

  const file = storage.todosFile.absolutePath
  if (existsSync(file)) {
    try {
      return parseTodoList(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      return emptyTodoList()
    }
  }

  const legacy = readLegacySandboxTodoList(storage.sandboxRoot)
  if (legacy && legacy.todos.length > 0) {
    writePlanModeTodoList(conversationId, legacy, options)
    return legacy
  }
  return emptyTodoList()
}

function syncPlanMarkdownFromTodoList(
  storage: PlanModeStoragePaths,
  list: TodoList,
): void {
  ensurePlanModePlansDir(storage.plansDirAbs)
  pruneStalePlanMarkdownFiles(storage.plansDirAbs, storage.planFile.absolutePath)
  const markdown = renderPlanMarkdownFromTodoList(list)
  writeFileSync(storage.planFile.absolutePath, markdown, 'utf8')
}

/** Wipe `plans/todos.json` (and synced plan markdown) so explore can start fresh. */
export function clearPlanModeTodoArtifacts(
  conversationId: string,
  options?: PlanModeStorageOptions,
): void {
  writePlanModeTodoList(conversationId, emptyTodoList(), options)
}

export function writePlanModeTodoList(
  conversationId: string,
  list: TodoList,
  options?: PlanModeStorageOptions,
): void {
  const storage = resolvePlanModeStorage(conversationId, options)
  if (!storage) return
  migrateLegacyPlanArtifacts(storage)
  ensurePlanModePlansDir(storage.plansDirAbs)
  writeFileSync(
    storage.todosFile.absolutePath,
    JSON.stringify(list, null, 2),
    'utf8',
  )
  syncPlanMarkdownFromTodoList(storage, list)
}

export function bootstrapPlanModeStorage(
  conversationId: string,
  title?: string,
  options?: PlanModeStorageOptions,
): PlanModeStoragePaths | null {
  const slug = assignPlanSlug(conversationId, title, {
    updateFromHint: Boolean(title?.trim()),
  })
  const storage = resolvePlanModeStorage(conversationId, {
    ...options,
    slug,
  })
  if (!storage) return null

  migrateLegacyPlanArtifacts(storage)
  ensurePlanModePlansDir(storage.plansDirAbs)
  pruneStalePlanMarkdownFiles(storage.plansDirAbs, storage.planFile.absolutePath)
  if (!existsSync(storage.planFile.absolutePath)) {
    const markdown = renderPlanModeMarkdown(planContextFromTodoList(emptyTodoList()))
    writeFileSync(storage.planFile.absolutePath, markdown, 'utf8')
  }
  return storage
}

/** @deprecated Alias for {@link bootstrapPlanModeStorage}. */
export function bootstrapPlanFileForConversation(
  conversationId: string,
  title?: string,
  options?: PlanModeStorageOptions,
): ResolvedPlanFile | null {
  return bootstrapPlanModeStorage(conversationId, title, options)?.planFile ?? null
}

export function isPathInPlanModePlansDir(
  storage: PlanModeStoragePaths,
  userPath: string,
): boolean {
  const norm = normalizePlanModeRelativePath(userPath).replace(/^\/+/, '')
  const plansPrefix = `${PLAN_MODE_PLANS_DIR}/`
  if (norm === PLAN_MODE_PLANS_DIR || norm.startsWith(plansPrefix)) {
    return true
  }
  const abs = join(storage.sandboxRoot, norm)
  return abs.startsWith(storage.plansDirAbs)
}

export function seedTodosFromPlanMarkdown(
  conversationId: string,
  planPath: string,
  options?: PlanModeStorageOptions,
): { seeded: number } {
  let content = ''
  try {
    content = readFileSync(planPath, 'utf8')
  } catch {
    return { seeded: 0 }
  }

  const steps = parsePlanStepsFromMarkdown(content)
  if (steps.length === 0) return { seeded: 0 }

  const list = replaceTodos(steps.map((content) => ({ content, status: 'pending' })))
  writePlanModeTodoList(conversationId, list, options)
  return { seeded: steps.length }
}
