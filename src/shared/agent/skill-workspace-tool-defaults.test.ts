import { describe, expect, it } from 'vitest'
import {
  expandSkillAllowedToolsForCatalog,
  expandSkillWorkspaceAvailableSet,
  mergeSkillWorkspaceApprovalOverrides,
  toolNamesMatchingTags,
} from './skill-workspace-tool-defaults'

const catalog = [
  { name: 'read_file', tags: ['file-system'], needsApproval: false },
  { name: 'edit_files', tags: ['file-system'], needsApproval: true },
  { name: 'shell', tags: ['file-system', 'workspace'], needsApproval: true },
  { name: 'web_search', tags: ['web'], needsApproval: false },
  { name: 'web_scrape', tags: ['web'], needsApproval: false },
  { name: 'export_research_pdf', tags: ['research'], needsApproval: true },
  { name: 'github_pr_create', tags: ['github'], needsApproval: true },
  { name: 'lsp', tags: ['code-intelligence'], needsApproval: false },
  { name: 'enter_plan_mode', tags: ['planning'], needsApproval: false },
  { name: 'update_todos', tags: ['task-tracking'], needsApproval: false },
  { name: 'invoke_agents', tags: ['sub-agents'], needsApproval: true },
]

describe('skill-workspace-tool-defaults', () => {
  it('matches tools by default skill toolset tags', () => {
    expect(toolNamesMatchingTags(catalog, ['file-system', 'workspace'])).toEqual([
      'read_file',
      'edit_files',
      'shell',
    ])
  })

  it('does not expand workspace tools for default skill allow-list', () => {
    const expanded = expandSkillAllowedToolsForCatalog('default', catalog, [
      'web_search',
      'shell',
    ])
    expect(expanded).toEqual(['web_search', 'shell'])
    expect(expanded).not.toContain('read_file')
  })

  it('returns undefined when skill has no allowed_tools allow-list', () => {
    expect(
      expandSkillAllowedToolsForCatalog('default', catalog, undefined),
    ).toBeUndefined()
    expect(expandSkillAllowedToolsForCatalog('default', catalog, [])).toBeUndefined()
  })

  it('does not expand coding skill — explicit allow-list only', () => {
    const expanded = expandSkillAllowedToolsForCatalog('coding', catalog, [
      'shell',
      'lsp',
    ])
    expect(expanded).toEqual(['shell', 'lsp'])
    expect(expanded).not.toContain('read_file')
  })

  it('does not expand write tools for coding-review', () => {
    const expanded = expandSkillAllowedToolsForCatalog('coding-review', catalog, [
      'read_file',
      'shell',
    ])
    expect(expanded).toEqual(['read_file', 'shell'])
    expect(expanded).not.toContain('edit_files')
  })

  it('expands file-system and workspace tools for research skill', () => {
    const expanded = expandSkillWorkspaceAvailableSet('research', catalog, ['lsp'])
    expect(expanded).toContain('edit_files')
    expect(expanded).toContain('shell')
    expect(expanded).toContain('web_search')
    expect(expanded).toContain('lsp')
  })

  it('expands research skill web and research tools', () => {
    const expanded = expandSkillAllowedToolsForCatalog('research', catalog, [
      'export_research_pdf',
    ])
    expect(expanded).toContain('web_search')
    expect(expanded).toContain('shell')
    expect(expanded).toContain('export_research_pdf')
  })

  it('builds no-approval overrides for research skill toolsets', () => {
    const overrides = mergeSkillWorkspaceApprovalOverrides(
      'research',
      catalog,
      [
        'read_file',
        'shell',
        'web_search',
        'web_scrape',
        'export_research_pdf',
      ],
      {},
    )
    expect(overrides).toEqual({
      read_file: false,
      shell: false,
      web_search: false,
      web_scrape: false,
      export_research_pdf: false,
    })
  })

  it('expands github skill with github-tagged action tools', () => {
    const expanded = expandSkillWorkspaceAvailableSet('github', catalog, [
      'shell',
    ])
    expect(expanded).toContain('edit_files')
    expect(expanded).toContain('github_pr_create')
    expect(expanded).not.toContain('lsp')
  })

  it('builds no-approval overrides for toolset tools on documents skill', () => {
    const overrides = mergeSkillWorkspaceApprovalOverrides(
      'documents',
      catalog,
      ['read_file', 'edit_files', 'shell', 'lsp'],
      {},
    )
    expect(overrides).toEqual({
      read_file: false,
      edit_files: false,
      shell: false,
    })
    expect(overrides.lsp).toBeUndefined()
  })

  it('saved approval overrides win over skill defaults', () => {
    const overrides = mergeSkillWorkspaceApprovalOverrides(
      'documents',
      catalog,
      ['edit_files', 'shell'],
      { edit_files: true },
    )
    expect(overrides.edit_files).toBe(true)
    expect(overrides.shell).toBe(false)
  })
})
