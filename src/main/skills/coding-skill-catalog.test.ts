import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expandSkillAllowedToolsForCatalog } from '@shared/agent/skill-workspace-tool-defaults'
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
  it('allowed_tools resolve to a Cursor-like lean set', async () => {
    const md = readFileSync(CODING_PROPERTIES, 'utf-8')
    const allowed = parseAllowedToolsFromProperties(md)
    expect(allowed).toEqual([
      'read_file',
      'edit_files',
      'lsp',
      'shell',
      'web_search',
      'web_scrape',
      'update_todos',
      'read_todos',
      'invoke_agents',
      'enter_plan_mode',
      'exit_plan_mode',
      'promote_artifact',
    ])

    const globalTools = await loadToolSetTools()
    const expanded = expandSkillAllowedToolsForCatalog(
      'coding',
      globalTools,
      allowed,
    )
    expect(expanded).toEqual([...new Set(allowed)])

    const catalog = resolveSkillToolCatalog(
      globalTools,
      [],
      expanded,
      'coding',
    )
    const catalogNames = new Set(catalog.map((t) => t.name))

    for (const name of allowed) {
      expect(catalogNames.has(name), `missing tool: ${name}`).toBe(true)
    }

    expect(catalogNames.has('edit_files')).toBe(true)
    expect(catalogNames.has('edit_file')).toBe(false)
    expect(catalogNames.has('write_file')).toBe(false)
    expect(catalogNames.has('apply_patch')).toBe(false)
    expect(catalogNames.has('delete_file')).toBe(false)
    expect(catalogNames.has('grep_files')).toBe(false)
    expect(catalogNames.has('glob_files')).toBe(false)
    expect(catalogNames.has('git_status')).toBe(false)
    expect(catalogNames.has('git_diff')).toBe(false)
    expect(catalogNames.has('best_of_n')).toBe(false)
  })

  it('includes core read/edit/shell/lsp tools', async () => {
    const md = readFileSync(CODING_PROPERTIES, 'utf-8')
    const allowed = new Set(
      expandSkillAllowedToolsForCatalog(
        'coding',
        await loadToolSetTools(),
        parseAllowedToolsFromProperties(md),
      ),
    )
    for (const name of [
      'read_file',
      'edit_files',
      'lsp',
      'shell',
    ]) {
      expect(allowed.has(name), `coding skill should allow ${name}`).toBe(true)
    }
  })
})
