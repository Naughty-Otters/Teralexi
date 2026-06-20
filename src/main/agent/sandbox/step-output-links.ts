import { readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getConversationStore } from '@main/services/conversation-store'
import type { StoredToolResult } from '@main/services/conversation-store/types'
import type { ThreadTag } from '../expr/thread-tagger'
import type { AgentStepContext } from '../types'
import type { ReferenceContext } from '../resources/context'
import {
  CREATE_PAPER_STEP_ID,
  TOOL_LOOP_STEP_ID,
  WEB_SCRAPE_STEP_ID,
} from '../constants/step-ids'
import { createPaperOutputDir } from '../steps/create-paper/paths'
import { webScrapeOutputDir } from '../steps/web-scrape/paths'
import type { SandboxContext } from './context'

export type StepOutputLink = {
  label: string
  url: string
}

export function sandboxOutputDir(sandboxRoot: string): string {
  return join(sandboxRoot, 'output')
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function isPathUnderDir(path: string, dir: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedDir = normalizePath(dir)
  if (!normalizedPath || !normalizedDir) return false
  return (
    normalizedPath === normalizedDir ||
    normalizedPath.startsWith(`${normalizedDir}/`)
  )
}

export function pathToSandboxPreviewUrl(absPath: string): string | undefined {
  const trimmed = absPath.trim()
  if (!trimmed) return undefined
  try {
    let href = pathToFileURL(trimmed).href
    if (statSync(trimmed).isDirectory() && !href.endsWith('/')) {
      href += '/'
    }
    return href
  } catch {
    return undefined
  }
}

function pushUniqueLink(
  links: StepOutputLink[],
  seen: Set<string>,
  absPath: string,
  label?: string,
): void {
  const url = pathToSandboxPreviewUrl(absPath)
  if (!url || seen.has(url)) return
  seen.add(url)
  links.push({
    label: label?.trim() || basename(absPath) || absPath,
    url,
  })
}

function listFilesUnderDir(
  dir: string,
  links: StepOutputLink[],
  seen: Set<string>,
  restrictToDir?: string,
  depth = 0,
): void {
  if (depth > 6) return
  if (restrictToDir && !isPathUnderDir(dir, restrictToDir)) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    if (restrictToDir && !isPathUnderDir(full, restrictToDir)) continue
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      listFilesUnderDir(full, links, seen, restrictToDir, depth + 1)
      continue
    }
    if (st.isFile()) {
      pushUniqueLink(links, seen, full)
    }
  }
}

export function buildOutputLinksFromPaths(
  paths: readonly string[],
  opts?: { restrictToDir?: string },
): StepOutputLink[] {
  const restrictToDir = opts?.restrictToDir?.trim()
  const links: StepOutputLink[] = []
  const seen = new Set<string>()
  for (const raw of paths) {
    const absPath = raw.trim()
    if (!absPath) continue
    if (restrictToDir && !isPathUnderDir(absPath, restrictToDir)) continue
    let st
    try {
      st = statSync(absPath)
    } catch {
      continue
    }
    if (st.isFile()) {
      pushUniqueLink(links, seen, absPath)
      continue
    }
    if (st.isDirectory()) {
      listFilesUnderDir(absPath, links, seen, restrictToDir)
    }
  }
  return links
}

export function formatStepOutputLinksMarkdown(
  links: readonly StepOutputLink[],
): string {
  if (!links.length) return ''
  const lines = links.map((link) => `- [${link.label}](${link.url})`)
  return `\n\n${lines.join('\n')}`
}

function toSandboxRelativePath(sandboxRoot: string, absPath: string): string {
  const root = normalizePath(sandboxRoot)
  const abs = normalizePath(absPath)
  if (abs === root) return 'output'
  if (abs.startsWith(`${root}/`)) return abs.slice(root.length + 1)
  return basename(absPath)
}

/** Sandbox-relative paths under `output/` (depth-first walk). */
export function collectSandboxOutputRelativePaths(
  sandboxRoot: string,
  opts?: { maxFiles?: number },
): string[] {
  const trimmed = sandboxRoot.trim()
  if (!trimmed) return []
  const outputRoot = sandboxOutputDir(trimmed)
  const maxFiles = opts?.maxFiles ?? 40
  const paths: string[] = []
  const seen = new Set<string>()

  function walk(dir: string, depth = 0): void {
    if (depth > 6 || paths.length >= maxFiles) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      if (!st.isFile()) continue
      const rel = toSandboxRelativePath(trimmed, full)
      if (!rel || seen.has(rel)) continue
      seen.add(rel)
      paths.push(rel)
      if (paths.length >= maxFiles) return
    }
  }

  walk(outputRoot)
  return paths
}

/** Keep sandbox paths referenced in persisted tool results for one thread tag. */
export function filterSandboxPathsByThreadToolResults(
  paths: readonly string[],
  results: readonly StoredToolResult[],
): string[] {
  if (paths.length === 0 || results.length === 0) return []
  const corpus = results
    .map((r) => `${r.outputText}\n${r.inputSummary}`)
    .join('\n')
  if (!corpus.trim()) return []

  return paths.filter((p) => {
    const name = basename(p)
    return corpus.includes(p) || (name.length > 0 && corpus.includes(name))
  })
}

export function collectSandboxOutputRelativePathsForThread(
  sandboxRoot: string,
  conversationId: string | undefined,
  threadTag: ThreadTag | undefined,
  opts?: { maxFiles?: number },
): string[] {
  const all = collectSandboxOutputRelativePaths(sandboxRoot, opts)
  if (all.length === 0) return []
  if (!conversationId?.trim() || !threadTag || threadTag === 'general') {
    return all
  }

  try {
    const results = getConversationStore().listToolResults(conversationId.trim(), {
      threadTag,
      limit: 500,
    })
    const filtered = filterSandboxPathsByThreadToolResults(all, results)
    return filtered.length > 0 ? filtered : all
  } catch {
    return all
  }
}

/** Instruction block listing deliverables already on disk in this conversation sandbox. */
export function formatExistingSandboxArtifactsBlock(
  sandboxRoot: string,
  opts?: { conversationId?: string; threadTag?: ThreadTag },
): string {
  const paths = collectSandboxOutputRelativePathsForThread(
    sandboxRoot,
    opts?.conversationId,
    opts?.threadTag,
  )
  if (paths.length === 0) return ''
  const threadNote =
    opts?.threadTag && opts.threadTag !== 'general'
      ? ` (thread: \`${opts.threadTag}\`)`
      : ''
  return [
    `### Existing sandbox artifacts${threadNote}`,
    'Reuse these files when the user continues or confirms a prior offer (e.g. "yes", "export the PDF"). Do **not** restart work when the deliverable already exists unless they ask to redo it.',
    ...paths.map((p) => `- \`${p}\``),
  ].join('\n')
}

export function collectOutputLinksForStep(
  step: AgentStepContext,
  sandbox: SandboxContext,
  _references: ReferenceContext,
): StepOutputLink[] {
  const root = sandbox.getRoot()
  if (!root) return []

  const outputRoot = sandboxOutputDir(root)
  const paths: string[] = []

  if (step.stepId === TOOL_LOOP_STEP_ID) {
    const relDir =
      typeof step.meta?.toolLoopOutputRelDir === 'string'
        ? step.meta.toolLoopOutputRelDir.trim()
        : ''
    if (relDir) {
      paths.push(join(root, relDir, 'results'))
    } else {
      paths.push(join(outputRoot, 'results'))
      paths.push(join(outputRoot, 'toolLoop'))
    }
  } else if (step.stepId === 'report') {
    paths.push(join(outputRoot, 'results', 'result-snapshot.pdf'))
  } else if (step.stepId === CREATE_PAPER_STEP_ID) {
    const outputPath =
      typeof step.meta?.outputPath === 'string'
        ? step.meta.outputPath.trim()
        : ''
    if (outputPath) {
      return buildOutputLinksFromPaths([outputPath])
    }
    paths.push(createPaperOutputDir(root))
    return buildOutputLinksFromPaths(paths)
  } else if (step.stepId === WEB_SCRAPE_STEP_ID) {
    const outputPath =
      typeof step.meta?.outputPath === 'string'
        ? step.meta.outputPath.trim()
        : ''
    if (outputPath) {
      return buildOutputLinksFromPaths([outputPath])
    }
    paths.push(webScrapeOutputDir(root))
    return buildOutputLinksFromPaths(paths)
  }

  return buildOutputLinksFromPaths(paths, { restrictToDir: outputRoot })
}

/** Paths to scan when building final step output links (sandbox output/ only). */
export function collectSandboxOutputLinkPaths(
  sandbox: SandboxContext,
): string[] {
  const root = sandbox.getRoot()
  if (!root) return []
  return [sandboxOutputDir(root)]
}
