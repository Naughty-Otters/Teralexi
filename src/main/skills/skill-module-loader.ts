import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  type Dirent,
} from 'fs'
import { basename, extname, join } from 'path'
import type { SkillTool } from './types'
import { SKILL_FILES, SKILL_MODULE } from './constants'
import { getBundledToolSetTools } from './bundled-toolset'
import { getBundledSkillActionTools } from './bundled-skill-actions'
import { isBundledSkillId } from './bundled-skills-manifest'
import {
  isLoadableSkillFolder,
  resolveUserToolSetDirectory,
  resolveUserSkillsDirectory,
} from './skill-path'
import { createLogger } from '@main/logger'
import {
  entryCacheKey,
  fingerprintFromMetafile,
  loadCachedCommonJsModule,
  resolveEsbuildForSkillCompile,
  shouldRebuildSkillModuleBundle,
  skillModuleCacheDir,
  toOnDiskAppPath,
  writeSkillModuleBundleFingerprint,
} from './skill-module-cache'
import { createSkillModuleRequire } from './skill-sdk-require'

const SKILL_SDK_MODULE_ID = '@teralexi/skill-sdk'

const log = createLogger('skills.module-loader')

const MODULE_PROBE_RE = /(?:^|\/)index(?:\.(?:ts|js|mjs|cjs))?$/i

function isModuleProbePath(filepath: string): boolean {
  return MODULE_PROBE_RE.test(filepath.replace(/\\/g, '/'))
}

function warnMissingModule(filepath: string, reason: string): void {
  if (isModuleProbePath(filepath)) {
    log.debug('Skill/toolSet module probe path not found', { filepath, reason })
    return
  }
  log.warn('Skill/toolSet module path not found', { filepath, reason })
}

async function requireModule(
  filepath: string,
): Promise<Record<string, unknown> | undefined> {
  if (filepath.endsWith('.ts')) {
    const onDiskPath = toOnDiskAppPath(filepath)
    if (!existsSync(onDiskPath)) {
      warnMissingModule(filepath, 'typescript source missing on disk')
      return undefined
    }
    try {
      if (statSync(onDiskPath).isDirectory()) {
        return undefined
      }
    } catch {
      return undefined
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const esbuild = resolveEsbuildForSkillCompile()

      const cacheDir = skillModuleCacheDir()
      mkdirSync(cacheDir, { recursive: true })
      const cacheKey = entryCacheKey(onDiskPath)
      const outJs = join(cacheDir, `${cacheKey}.js`)

      if (shouldRebuildSkillModuleBundle(outJs)) {
        const result = await esbuild.build({
          entryPoints: [onDiskPath],
          outfile: outJs,
          bundle: true,
          format: 'cjs',
          platform: 'node',
          packages: 'external',
          external: [SKILL_SDK_MODULE_ID],
          sourcemap: true,
          sourcesContent: true,
          metafile: true,
        })
        if (result.metafile) {
          writeSkillModuleBundleFingerprint(
            outJs,
            fingerprintFromMetafile(result.metafile),
          )
        }
      }

      return loadCachedCommonJsModule(outJs, createSkillModuleRequire(outJs))
    } catch (err) {
      log.warn('Failed to compile skill/toolSet module', { filepath, err })
      return undefined
    }
  }

  try {
    if (!existsSync(filepath)) {
      warnMissingModule(filepath, 'javascript module missing on disk')
      return undefined
    }
    try {
      if (statSync(filepath).isDirectory()) {
        return undefined
      }
    } catch {
      return undefined
    }
    return loadCachedCommonJsModule(filepath, createSkillModuleRequire(filepath))
  } catch (err) {
    log.warn('Failed to load skill/toolSet module', { filepath, err })
    return undefined
  }
}

function isSkillTool(value: unknown): value is SkillTool {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    typeof (value as Record<string, unknown>).description === 'string' &&
    typeof (value as Record<string, unknown>).execute === 'function'
  )
}

function collectToolsFromModule(
  loaded: Record<string, unknown>,
  source?: string,
): SkillTool[] {
  let tools: SkillTool[] = []
  if (Array.isArray(loaded.tools)) {
    tools = loaded.tools.filter(isSkillTool)
  } else {
    const def = loaded.default
    if (def && typeof def === 'object' && Array.isArray((def as any).tools)) {
      tools = ((def as any).tools as unknown[]).filter(isSkillTool)
    } else {
      tools = Object.values(loaded).filter(isSkillTool)
    }
  }

  if (tools.length === 0 && source) {
    log.warn('Module loaded but exported no skill tools', {
      source,
      exportKeys: Object.keys(loaded),
    })
  }

  return tools
}

function filterByDeclared(
  tools: SkillTool[],
  declaredNames: string[],
): SkillTool[] {
  if (declaredNames.length === 0) return tools
  const nameSet = new Set(declaredNames)
  return tools.filter((t) => nameSet.has(t.name))
}

const ACTION_MODULE_EXT_RE = /\.(ts|js|mjs|cjs)$/
const ACTION_INDEX_RE = /^index\.(ts|js|mjs|cjs)$/

async function loadSkillActionsFromDirectory(
  actionsDir: string,
): Promise<SkillTool[]> {
  if (!existsSync(actionsDir)) {
    log.debug('Skill actions directory missing', { actionsDir })
    return []
  }

  const indexCandidates = [
    join(actionsDir, 'index.ts'),
    join(actionsDir, 'index.js'),
    join(actionsDir, 'index.mjs'),
    join(actionsDir, 'index.cjs'),
  ]

  for (const candidate of indexCandidates) {
    const loaded = await requireModule(candidate)
    if (!loaded) continue
    const tools = collectToolsFromModule(loaded, candidate)
    if (tools.length > 0) return tools
  }

  const allTools: SkillTool[] = []
  let entries: Dirent[]
  try {
    entries = readdirSync(actionsDir, { withFileTypes: true })
  } catch (err) {
    log.warn('Failed to read skill actions directory', { actionsDir, err })
    return []
  }

  for (const entry of entries) {
    const entryPath = join(actionsDir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue
      allTools.push(...(await loadSkillActionsFromDirectory(entryPath)))
      continue
    }
    if (!entry.isFile()) continue
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.js')) continue
    if (ACTION_INDEX_RE.test(entry.name)) continue
    if (!ACTION_MODULE_EXT_RE.test(entry.name)) continue

    const fileCandidates = [
      entryPath,
      entryPath.replace(ACTION_MODULE_EXT_RE, ''),
    ]

    for (const modulePath of fileCandidates) {
      const loaded = await requireModule(modulePath)
      if (!loaded) continue
      const tools = collectToolsFromModule(loaded, modulePath)
      if (tools.length > 0) {
        allTools.push(...tools)
      }
      break
    }
  }

  if (allTools.length === 0) {
    log.warn('Skill actions directory produced no tools', { actionsDir })
  }

  return allTools
}

export async function loadSkillActions(
  skillFolder: string,
  declaredToolNames: string[],
): Promise<SkillTool[]> {
  const actionsDir = join(skillFolder, SKILL_FILES.ACTIONS_DIR)
  const allTools = await loadSkillActionsFromDirectory(actionsDir)
  const filtered = filterByDeclared(allTools, declaredToolNames)
  if (filtered.length === 0 && declaredToolNames.length > 0) {
    log.warn('No skill action tools matched declared allowed_tools names', {
      skillFolder,
      declaredToolNames,
      loadedToolNames: allTools.map((t) => t.name),
    })
  }
  return filtered
}

/** Load skill-owned tools from user disk or statically bundled catalog. */
export async function loadSkillActionsForSkillId(
  skillId: string,
  declaredToolNames: string[],
): Promise<SkillTool[]> {
  const userSkillsDir = resolveUserSkillsDirectory()
  if (isLoadableSkillFolder(userSkillsDir, skillId)) {
    return loadSkillActions(join(userSkillsDir, skillId), declaredToolNames)
  }
  if (isBundledSkillId(skillId)) {
    return getBundledSkillActionTools(skillId, declaredToolNames)
  }
  return []
}

export async function loadToolSetToolsFromDirectory(
  toolSetDir: string,
): Promise<SkillTool[]> {
  if (!existsSync(toolSetDir)) {
    log.warn('toolSet directory does not exist', { toolSetDir })
    return []
  }

  const withDefaultTags = (
    tools: SkillTool[],
    defaultTag: string,
  ): SkillTool[] => {
    return tools.map((tool) => {
      const cleanedTags = (tool.tags ?? []).filter(
        (tag) => typeof tag === 'string' && tag.trim() !== '',
      )
      if (cleanedTags.length > 0) {
        return { ...tool, tags: Array.from(new Set(cleanedTags)) }
      }
      return { ...tool, tags: [defaultTag] }
    })
  }

  const moduleFiles = readdirSync(toolSetDir)
    .filter((name) => {
      if (name.startsWith('index.')) return false
      const ext = extname(name)
      return ext === '.ts' || ext === '.js' || ext === '.mjs' || ext === '.cjs'
    })
    .map((name) => ({
      name,
      filePath: join(toolSetDir, name),
      moduleTag: basename(name, extname(name)),
    }))

  if (moduleFiles.length > 0) {
    const toolMap = new Map<string, SkillTool>()

    for (const moduleFile of moduleFiles) {
      // Skip test files
      if (moduleFile.filePath.endsWith('.test.ts')) continue

      const loaded = await requireModule(moduleFile.filePath)
      if (!loaded) continue

      const tools = withDefaultTags(
        collectToolsFromModule(loaded, moduleFile.filePath),
        moduleFile.moduleTag,
      )
      if (tools.length === 0) continue
      for (const tool of tools) {
        if (!toolMap.has(tool.name)) toolMap.set(tool.name, tool)
      }
    }

    if (toolMap.size > 0) {
      return Array.from(toolMap.values())
    }

    log.warn('toolSet module files loaded but produced no tools; trying index', {
      toolSetDir,
      moduleFiles: moduleFiles.map((f) => f.name),
    })
  }

  const candidates = [
    join(toolSetDir, 'index.ts'),
    join(toolSetDir, 'index.js'),
    join(toolSetDir, 'index.mjs'),
    join(toolSetDir, 'index'),
  ]

  for (const candidate of candidates) {
    const loaded = await requireModule(candidate)
    if (!loaded) continue
    const tools = withDefaultTags(
      collectToolsFromModule(loaded, candidate),
      SKILL_MODULE.DEFAULT_TOOL_SET_TAG,
    )
    if (tools.length > 0) return tools
  }

  log.warn('toolSet directory produced no tools after scanning modules and index', {
    toolSetDir,
  })
  return []
}

let cachedToolSetTools: SkillTool[] | null = null
let toolSetLoadPromise: Promise<SkillTool[]> | null = null

/** Clears the in-memory toolSet catalog (tests / dev cache bust). */
export function resetToolSetCatalogCache(): void {
  cachedToolSetTools = null
  toolSetLoadPromise = null
}

async function loadToolSetToolsUncached(): Promise<SkillTool[]> {
  const merged = new Map<string, SkillTool>()
  const sources: Array<{ dir: string; count: number; exists: boolean }> = []

  const bundledTools = getBundledToolSetTools()
  sources.push({ dir: 'bundled:main.js', count: bundledTools.length, exists: true })
  for (const tool of bundledTools) {
    merged.set(tool.name, tool)
  }

  const userToolSetDir = resolveUserToolSetDirectory()
  const userDirExists = existsSync(userToolSetDir)
  if (userDirExists) {
    const userTools = await loadToolSetToolsFromDirectory(userToolSetDir)
    sources.push({
      dir: userToolSetDir,
      count: userTools.length,
      exists: true,
    })

    if (userTools.length > 0) {
      log.info('Loaded user toolSet tools from directory', {
        toolSetDir: userToolSetDir,
        count: userTools.length,
        sample: userTools.slice(0, 10).map((t) => t.name),
      })
    } else {
      log.warn('User toolSet directory exists but produced no tools', {
        toolSetDir: userToolSetDir,
      })
    }

    for (const tool of userTools) {
      merged.set(tool.name, tool)
    }
  } else {
    sources.push({ dir: userToolSetDir, count: 0, exists: false })
  }

  const tools = Array.from(merged.values())
  if (tools.length === 0) {
    const detail = sources
      .map((r) => `${r.dir}${r.exists ? '' : ' (missing)'}: ${r.count} tools`)
      .join('; ')
    const message = `toolSet failed to load: 0 tools — ${detail}`
    log.error(message)
    throw new Error(message)
  }

  log.info('toolSet catalog ready', {
    toolCount: tools.length,
    sources,
    sample: tools.slice(0, 12).map((t) => t.name),
  })

  return tools
}

/** Merges statically bundled tools with user `~/.teralexi/toolSet`; user wins on name conflicts. */
export async function loadToolSetTools(): Promise<SkillTool[]> {
  if (cachedToolSetTools) return cachedToolSetTools
  if (!toolSetLoadPromise) {
    toolSetLoadPromise = loadToolSetToolsUncached()
      .then((tools) => {
        cachedToolSetTools = tools
        return tools
      })
      .catch((err) => {
        toolSetLoadPromise = null
        throw err
      })
  }
  return toolSetLoadPromise
}

/** Fire-and-forget startup load; safe to call alongside renderer boot. */
export function startToolSetCatalogLoad(): Promise<SkillTool[]> {
  return loadToolSetTools()
}

export { clearSkillModuleCache } from './skill-module-cache'
