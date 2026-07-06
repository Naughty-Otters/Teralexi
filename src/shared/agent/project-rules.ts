import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type ProjectRule = {
  name: string
  content: string
  source: string
}

const RULE_FILE_RE = /\.(?:md|mdc)$/i

function readRuleFile(filePath: string, label: string): ProjectRule | null {
  try {
    const content = readFileSync(filePath, 'utf-8').trim()
    if (!content) return null
    const name = filePath.split(/[/\\]/).pop()?.replace(/\.(md|mdc)$/i, '') ?? label
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

export function loadProjectRules(options: {
  userRulesDir?: string | null
  workspaceRulesDir?: string | null
}): ProjectRule[] {
  const user = loadRulesFromDirectory(
    options.userRulesDir?.trim() ?? '',
    '~/.teralexi/rules',
  )
  const workspace = loadRulesFromDirectory(
    options.workspaceRulesDir?.trim() ?? '',
    '.teralexi/rules',
  )
  return [...user, ...workspace]
}

export function formatProjectRulesBlock(rules: readonly ProjectRule[]): string {
  if (rules.length === 0) return ''

  const sections = rules.map(
    (rule) => `#### ${rule.name}\n\n${rule.content}`,
  )
  return ['### Project rules', '', ...sections].join('\n')
}
