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
import { resolveToolSetSourceRoots } from './skill-path'
import {
  entryCacheKey,
  esbuildPathAliases,
  fingerprintFromMetafile,
  shouldRebuildSkillModuleBundle,
  skillModuleCacheDir,
  writeSkillModuleBundleFingerprint,
} from './skill-module-cache'

async function requireModule(
  filepath: string,
): Promise<Record<string, unknown> | undefined> {
  if (filepath.endsWith('.ts')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const esbuild = require('esbuild') as typeof import('esbuild')

      const cacheDir = skillModuleCacheDir()
      mkdirSync(cacheDir, { recursive: true })
      const cacheKey = entryCacheKey(filepath)
      const outJs = join(cacheDir, `${cacheKey}.js`)

      if (shouldRebuildSkillModuleBundle(outJs)) {
        const result = await esbuild.build({
          entryPoints: [filepath],
          outfile: outJs,
          bundle: true,
          format: 'cjs',
          platform: 'node',
          packages: 'external',
          sourcemap: true,
          sourcesContent: true,
          metafile: true,
          alias: esbuildPathAliases(),
        })
        if (result.metafile) {
          writeSkillModuleBundleFingerprint(
            outJs,
            fingerprintFromMetafile(result.metafile),
          )
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(outJs) as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(filepath) as Record<string, unknown>
  } catch {
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

function collectToolsFromModule(loaded: Record<string, unknown>): SkillTool[] {
  if (Array.isArray(loaded.tools)) {
    return loaded.tools.filter(isSkillTool)
  }

  const def = loaded.default
  if (def && typeof def === 'object' && Array.isArray((def as any).tools)) {
    return ((def as any).tools as unknown[]).filter(isSkillTool)
  }

  return Object.values(loaded).filter(isSkillTool)
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
  if (!existsSync(actionsDir)) return []

  const indexCandidates = [
    actionsDir,
    join(actionsDir, 'index'),
    join(actionsDir, 'index.ts'),
    join(actionsDir, 'index.js'),
    join(actionsDir, 'index.mjs'),
    join(actionsDir, 'index.cjs'),
  ]

  for (const candidate of indexCandidates) {
    const loaded = await requireModule(candidate)
    if (!loaded) continue
    const tools = collectToolsFromModule(loaded)
    if (tools.length > 0) return tools
  }

  const allTools: SkillTool[] = []
  let entries: Dirent[]
  try {
    entries = readdirSync(actionsDir, { withFileTypes: true })
  } catch {
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
    if (ACTION_INDEX_RE.test(entry.name)) continue
    if (!ACTION_MODULE_EXT_RE.test(entry.name)) continue

    const fileCandidates = [
      entryPath,
      entryPath.replace(ACTION_MODULE_EXT_RE, ''),
    ]

    for (const modulePath of fileCandidates) {
      const loaded = await requireModule(modulePath)
      if (!loaded) continue
      allTools.push(...collectToolsFromModule(loaded))
      break
    }
  }

  return allTools
}

export async function loadSkillActions(
  skillFolder: string,
  declaredToolNames: string[],
): Promise<SkillTool[]> {
  const actionsDir = join(skillFolder, SKILL_FILES.ACTIONS_DIR)
  const allTools = await loadSkillActionsFromDirectory(actionsDir)
  return filterByDeclared(allTools, declaredToolNames)
}

export async function loadToolSetToolsFromDirectory(
  toolSetDir: string,
): Promise<SkillTool[]> {
  if (!existsSync(toolSetDir)) return []

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
        collectToolsFromModule(loaded),
        moduleFile.moduleTag,
      )
      for (const tool of tools) {
        if (!toolMap.has(tool.name)) toolMap.set(tool.name, tool)
      }
    }

    if (toolMap.size > 0) {
      return Array.from(toolMap.values())
    }
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
      collectToolsFromModule(loaded),
      SKILL_MODULE.DEFAULT_TOOL_SET_TAG,
    )
    if (tools.length > 0) return tools
  }

  return []
}

/** Merges bundled then user `toolSet/`; user tools win on name conflicts. */
export async function loadToolSetTools(): Promise<SkillTool[]> {
  const merged = new Map<string, SkillTool>()
  for (const toolSetDir of resolveToolSetSourceRoots()) {
    const tools = await loadToolSetToolsFromDirectory(toolSetDir)
    for (const tool of tools) {
      merged.set(tool.name, tool)
    }
  }
  return Array.from(merged.values())
}

export { clearSkillModuleCache } from './skill-module-cache'
