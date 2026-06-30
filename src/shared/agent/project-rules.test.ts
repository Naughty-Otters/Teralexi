import { describe, expect, it } from 'vitest'
import {
  formatProjectRulesBlock,
  loadProjectRules,
} from './project-rules'

describe('project-rules', () => {
  it('loads and formats markdown rules from user and workspace dirs', () => {
    const rules = loadProjectRules({
      userRulesDir: `${process.cwd()}/.openfde/rules`,
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
})
