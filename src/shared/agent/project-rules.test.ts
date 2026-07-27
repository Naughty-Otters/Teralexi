import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  formatProjectRulesBlock,
  loadProjectRules,
  loadWorkspaceAgentRuleFiles,
} from './project-rules'

describe('project-rules', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('loads and formats markdown rules from user and workspace dirs', () => {
    const rules = loadProjectRules({
      userRulesDir: `${process.cwd()}/.teralexi/rules`,
      workspaceRulesDir: null,
    })
    expect(rules.length).toBeGreaterThan(0)
    const block = formatProjectRulesBlock(rules)
    expect(block).toContain('### Project rules')
    expect(block).toContain('coding-standards')
  })

  it('returns empty block when no rules exist', () => {
    expect(formatProjectRulesBlock([])).toBe('')
  })

  it('loads workspace AGENTS.md / CLAUDE.md style files', () => {
    const root = mkdtempSync(join(tmpdir(), 'teralexi-rules-'))
    dirs.push(root)
    writeFileSync(join(root, 'AGENTS.md'), 'Use pnpm.')
    writeFileSync(join(root, 'CLAUDE.md'), 'Prefer small PRs.')
    const rules = loadWorkspaceAgentRuleFiles(root)
    expect(rules.map((r) => r.name).sort()).toEqual(['AGENTS', 'CLAUDE'])
    const loaded = loadProjectRules({
      userRulesDir: null,
      workspaceRulesDir: null,
      workspaceRoot: root,
    })
    expect(loaded.some((r) => r.content.includes('pnpm'))).toBe(true)
  })
})
