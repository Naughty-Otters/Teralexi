import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadToolSetTools } from './skill-module-loader'
import { resolveSkillToolCatalog } from './resolve-skill-tools'
import {
  parseCommaSeparatedToolList,
  parseFrontmatter,
} from './skill-markdown'

const CODING_PROPERTIES = join(
  process.cwd(),
  'skills',
  'coding',
  'properties.md',
)

function parseAllowedToolsFromProperties(md: string): string[] {
  const fm = parseFrontmatter(md)
  return parseCommaSeparatedToolList(fm.allowed_tools as string | undefined)
}

describe('coding skill catalog', () => {
  it('allowed_tools in properties.md resolve to registered toolSet tools', async () => {
    const md = readFileSync(CODING_PROPERTIES, 'utf-8')
    const allowed = parseAllowedToolsFromProperties(md)
    expect(allowed.length).toBeGreaterThan(10)

    const globalTools = await loadToolSetTools()
    const catalog = resolveSkillToolCatalog(globalTools, [], allowed)
    const catalogNames = new Set(catalog.map((t) => t.name))

    for (const name of allowed) {
      expect(catalogNames.has(name), `missing tool: ${name}`).toBe(true)
    }

    expect(catalogNames.has('read_file')).toBe(true)
    expect(catalogNames.has('run_workspace_command')).toBe(true)
    expect(catalogNames.has('delete_file')).toBe(true)
    expect(catalogNames.has('lsp')).toBe(true)
    expect(catalogNames.has('git_create_pr')).toBe(true)
    expect(catalogNames.has('enter_plan_mode')).toBe(true)
    expect(catalogNames.has('exit_plan_mode')).toBe(true)
    expect(catalogNames.has('invoke_agent')).toBe(true)
    expect(catalogNames.has('invoke_agents')).toBe(true)
  })

  it('includes workspace file CRUD and verification tools coding workflow needs', async () => {
    const md = readFileSync(CODING_PROPERTIES, 'utf-8')
    const allowed = new Set(parseAllowedToolsFromProperties(md))
    const required = [
      'read_file',
      'edit_file',
      'apply_patch',
      'delete_file',
      'grep_files',
      'glob_files',
      'run_workspace_command',
      'lsp',
      'git_status',
      'git_diff',
    ]
    for (const name of required) {
      expect(allowed.has(name), `coding skill should allow ${name}`).toBe(true)
    }
  })
})
