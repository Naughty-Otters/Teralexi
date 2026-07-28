import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type ProjectRule = {
  name: string
  content: string
  source: string
}

const RULE_FILE_RE = /\.(?:md|mdc)$/i

/** Workspace-root always-on instruction files (Codex / Claude Code / Cursor / …). */
export const WORKSPACE_AGENT_RULE_FILES = [
  'AGENTS.md',
  'AGENT.md',
  'agents.md',
  'agent.md',
  'CLAUDE.md',
  'claude.md',
  'CODEX.md',
  'codex.md',
] as const

function readRuleFile(filePath: string, label: string): ProjectRule | null {
  try {
    const content = readFileSync(filePath, 'utf-8').trim()
    if (!content) return null
    const name =
      filePath.split(/[/\\]/).pop()?.replace(/\.(md|mdc)$/i, '') ?? label
    return { name, content, source: label }
  } catch {
    return null
  }
}

function loadRulesFromDirectory(
  dir: string,
  sourceLabel: string,
): ProjectRule[] {
  if (!dir.trim() || !existsSync(dir)) return []

  const rules: ProjectRule[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }

  for (const entry of entries.sort()) {
    if (entry.startsWith('.')) continue
    if (!RULE_FILE_RE.test(entry)) continue
    const rule = readRuleFile(join(dir, entry), `${sourceLabel}/${entry}`)
    if (rule) rules.push(rule)
  }
  return rules
}

/**
 * Load always-on agent instruction files from a workspace root
 * (AGENTS.md / AGENT.md / CLAUDE.md / CODEX.md).
 */
export function loadWorkspaceAgentRuleFiles(
  workspaceRoot?: string | null,
): ProjectRule[] {
  const root = workspaceRoot?.trim()
  if (!root || !existsSync(root)) return []

  const rules: ProjectRule[] = []
  const seenLower = new Set<string>()
  for (const name of WORKSPACE_AGENT_RULE_FILES) {
    const lower = name.toLowerCase()
    if (seenLower.has(lower)) continue
    const path = join(root, name)
    if (!existsSync(path)) continue
    seenLower.add(lower)
    const rule = readRuleFile(path, `workspace/${name}`)
    if (rule) rules.push(rule)
  }
  return rules
}

export function loadProjectRules(options: {
  userRulesDir?: string | null
  workspaceRulesDir?: string | null
  workspaceRoot?: string | null
}): ProjectRule[] {
  const user = loadRulesFromDirectory(
    options.userRulesDir?.trim() ?? '',
    '~/.teralexi/rules',
  )
  const workspace = loadRulesFromDirectory(
    options.workspaceRulesDir?.trim() ?? '',
    '.teralexi/rules',
  )
  const agentFiles = loadWorkspaceAgentRuleFiles(options.workspaceRoot)
  return [...user, ...workspace, ...agentFiles]
}

export function formatProjectRulesBlock(rules: readonly ProjectRule[]): string {
  if (rules.length === 0) return ''

  const sections = rules.map(
    (rule) => `#### ${rule.name}\n\n${rule.content}`,
  )
  return ['### Project rules', '', ...sections].join('\n')
}
