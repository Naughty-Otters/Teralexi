import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SKILL_TOOLSET_TAGS,
  expandSkillAllowedToolsForCatalog,
  expandSkillWorkspaceAvailableSet,
  mergeSkillWorkspaceApprovalOverrides,
  toolNamesMatchingTags,
} from './skill-workspace-tool-defaults'

const catalog = [
  { name: 'read_file', tags: ['file-system'], needsApproval: false },
  { name: 'write_file', tags: ['file-system'], needsApproval: true },
  { name: 'run_workspace_command', tags: ['file-system', 'workspace'], needsApproval: true },
  { name: 'git_commit', tags: ['git'], needsApproval: true },
  { name: 'run_script', tags: ['shell-command'], needsApproval: false },
  { name: 'web_search', tags: ['web'], needsApproval: false },
  { name: 'github_pr_create', tags: ['github'], needsApproval: true },
  { name: 'lsp', tags: ['lsp'], needsApproval: false },
]

describe('skill-workspace-tool-defaults', () => {
  it('matches tools by default skill toolset tags', () => {
    expect(toolNamesMatchingTags(catalog, DEFAULT_SKILL_TOOLSET_TAGS)).toEqual([
      'read_file',
      'write_file',
      'run_workspace_command',
      'git_commit',
    ])
  })

  it('expands properties.md allowed_tools before catalog resolution', () => {
    const expanded = expandSkillAllowedToolsForCatalog('default', catalog, [
      'web_search',
      'run_script',
    ])
    expect(expanded).toContain('web_search')
    expect(expanded).toContain('read_file')
    expect(expanded).toContain('git_commit')
    expect(expanded).toContain('run_workspace_command')
    expect(expanded).toContain('run_script')
    expect(expanded).not.toContain('lsp')
  })

  it('returns undefined when skill has no allowed_tools allow-list', () => {
    expect(
      expandSkillAllowedToolsForCatalog('default', catalog, undefined),
    ).toBeUndefined()
    expect(expandSkillAllowedToolsForCatalog('default', catalog, [])).toBeUndefined()
  })

  it('expands file-system, git, and workspace tools for any skill', () => {
    const expanded = expandSkillWorkspaceAvailableSet('research', catalog, ['lsp'])
    expect(expanded).toContain('write_file')
    expect(expanded).toContain('run_workspace_command')
    expect(expanded).toContain('git_commit')
    expect(expanded).not.toContain('run_script')
    expect(expanded).not.toContain('web_search')
    expect(expanded).toContain('lsp')
  })

  it('expands github skill with github-tagged action tools', () => {
    const expanded = expandSkillWorkspaceAvailableSet('github', catalog, [
      'git_status',
    ])
    expect(expanded).toContain('write_file')
    expect(expanded).toContain('github_pr_create')
    expect(expanded).not.toContain('lsp')
  })

  it('builds no-approval overrides for toolset tools on any skill', () => {
    const overrides = mergeSkillWorkspaceApprovalOverrides(
      'documents',
      catalog,
      ['read_file', 'write_file', 'git_commit', 'run_script', 'lsp'],
      {},
    )
    expect(overrides).toEqual({
      read_file: false,
      write_file: false,
      git_commit: false,
    })
    expect(overrides.run_script).toBeUndefined()
    expect(overrides.lsp).toBeUndefined()
  })

  it('saved approval overrides win over skill defaults', () => {
    const overrides = mergeSkillWorkspaceApprovalOverrides(
      'coding',
      catalog,
      ['write_file', 'git_commit'],
      { write_file: true },
    )
    expect(overrides.write_file).toBe(true)
    expect(overrides.git_commit).toBe(false)
  })
})
