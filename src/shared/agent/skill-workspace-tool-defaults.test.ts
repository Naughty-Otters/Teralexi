import { describe, expect, it } from 'vitest'
import {
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
  { name: 'run_script_file', tags: ['shell-command'], needsApproval: false },
  { name: 'web_search', tags: ['web'], needsApproval: false },
  { name: 'web_scrape', tags: ['web'], needsApproval: false },
  { name: 'deep_research', tags: ['web', 'research', 'scholar'], needsApproval: true },
  { name: 'export_research_pdf', tags: ['research'], needsApproval: true },
  { name: 'github_pr_create', tags: ['github'], needsApproval: true },
  { name: 'lsp', tags: ['code-intelligence'], needsApproval: false },
  { name: 'enter_plan_mode', tags: ['planning'], needsApproval: false },
  { name: 'update_todos', tags: ['task-tracking'], needsApproval: false },
  { name: 'invoke_agent', tags: ['sub-agents'], needsApproval: true },
]

describe('skill-workspace-tool-defaults', () => {
  it('matches tools by default skill toolset tags', () => {
    expect(toolNamesMatchingTags(catalog, ['file-system', 'git', 'workspace'])).toEqual([
      'read_file',
      'write_file',
      'run_workspace_command',
      'git_commit',
    ])
  })

  it('does not expand workspace tools for default skill allow-list', () => {
    const expanded = expandSkillAllowedToolsForCatalog('default', catalog, [
      'web_search',
      'run_script',
    ])
    expect(expanded).toEqual(['web_search', 'run_script'])
    expect(expanded).not.toContain('read_file')
    expect(expanded).not.toContain('git_commit')
  })

  it('returns undefined when skill has no allowed_tools allow-list', () => {
    expect(
      expandSkillAllowedToolsForCatalog('default', catalog, undefined),
    ).toBeUndefined()
    expect(expandSkillAllowedToolsForCatalog('default', catalog, [])).toBeUndefined()
  })

  it('expands coding skill with file-system, git, workspace, and coding extras', () => {
    const expanded = expandSkillAllowedToolsForCatalog('coding', catalog, [
      'grep_files',
    ])
    expect(expanded).toContain('grep_files')
    expect(expanded).toContain('read_file')
    expect(expanded).toContain('run_workspace_command')
    expect(expanded).toContain('git_commit')
    expect(expanded).toContain('lsp')
    expect(expanded).toContain('enter_plan_mode')
    expect(expanded).toContain('update_todos')
    expect(expanded).toContain('invoke_agent')
    expect(expanded).not.toContain('run_script')
  })

  it('does not expand write tools for coding-review', () => {
    const expanded = expandSkillAllowedToolsForCatalog('coding-review', catalog, [
      'read_file',
      'git_diff',
    ])
    expect(expanded).toEqual(['read_file', 'git_diff'])
    expect(expanded).not.toContain('write_file')
  })

  it('expands file-system, git, and workspace tools for research skill', () => {
    const expanded = expandSkillWorkspaceAvailableSet('research', catalog, ['lsp'])
    expect(expanded).toContain('write_file')
    expect(expanded).toContain('run_workspace_command')
    expect(expanded).toContain('git_commit')
    expect(expanded).toContain('web_search')
    expect(expanded).toContain('run_script')
    expect(expanded).toContain('lsp')
  })

  it('expands research skill web, scholar, shell-command, and research tools', () => {
    const expanded = expandSkillAllowedToolsForCatalog('research', catalog, [
      'export_research_pdf',
    ])
    expect(expanded).toContain('web_search')
    expect(expanded).toContain('run_script')
    expect(expanded).toContain('run_workspace_command')
    expect(expanded).toContain('export_research_pdf')
  })

  it('builds no-approval overrides for research skill toolsets', () => {
    const overrides = mergeSkillWorkspaceApprovalOverrides(
      'research',
      catalog,
      [
        'read_file',
        'run_workspace_command',
        'web_search',
        'web_scrape',
        'run_script',
        'run_script_file',
        'deep_research',
        'export_research_pdf',
      ],
      {},
    )
    expect(overrides).toEqual({
      read_file: false,
      run_workspace_command: false,
      web_search: false,
      web_scrape: false,
      run_script: false,
      run_script_file: false,
      deep_research: false,
      export_research_pdf: false,
    })
  })

  it('expands github skill with github-tagged action tools', () => {
    const expanded = expandSkillWorkspaceAvailableSet('github', catalog, [
      'git_status',
    ])
    expect(expanded).toContain('write_file')
    expect(expanded).toContain('github_pr_create')
    expect(expanded).not.toContain('lsp')
  })

  it('builds no-approval overrides for toolset tools on documents skill', () => {
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
