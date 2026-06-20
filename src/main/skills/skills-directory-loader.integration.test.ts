import { describe, expect, it } from 'vitest'
import { loadSkillsFromDirectory } from './skills-directory-loader'
import { resolveBundledSkillsDirectory } from './skill-path'

describe('loadSkillsFromDirectory (integration)', () => {
  it('scopes google_* tools to google-workspace skill only', async () => {
    const skills = await loadSkillsFromDirectory(resolveBundledSkillsDirectory())
    const google = skills.find((s) => s.id === 'google-workspace')
    const documents = skills.find((s) => s.id === 'documents')
    const defaultSkill = skills.find((s) => s.id === 'default')

    expect(google?.actionToolNames).toContain('google_workspace_auth_status')
    expect(google?.tools.some((t) => t.name === 'google_gmail_send')).toBe(true)
    expect(documents?.tools.some((t) => t.name === 'google_gmail_send')).toBe(
      false,
    )
    expect(defaultSkill?.tools.some((t) => t.name === 'google_gmail_send')).toBe(
      false,
    )
  })

  it('keeps git_* tools in default when github skill is absent', async () => {
    const skills = await loadSkillsFromDirectory(resolveBundledSkillsDirectory())
    const github = skills.find((s) => s.id === 'github')
    const defaultSkill = skills.find((s) => s.id === 'default')

    expect(github).toBeUndefined()
    expect(defaultSkill?.tools.some((t) => t.name === 'git_status')).toBe(true)
    expect(defaultSkill?.tools.some((t) => t.name === 'read_file')).toBe(true)
    expect(defaultSkill?.tools.some((t) => t.name === 'github_pr_list')).toBe(
      false,
    )
    expect(defaultSkill?.tools.some((t) => t.name === 'github_auth_status')).toBe(
      false,
    )
  })

  it('documents catalog is allowed toolSet plus action tools only', async () => {
    const skills = await loadSkillsFromDirectory(resolveBundledSkillsDirectory())
    const documents = skills.find((s) => s.id === 'documents')
    expect(documents).toBeDefined()
    const names = new Set(documents!.tools.map((t) => t.name))
    expect(names.has('read_file')).toBe(true)
    expect(names.has('web_search')).toBe(true)
    expect(names.has('git_status')).toBe(true)
    if (documents!.actionToolNames.includes('create_spreadsheet')) {
      expect(names.has('create_spreadsheet')).toBe(true)
    }
  })

  it('loads workflow-compiler and workflow-runtime with workflow visibility', async () => {
    const skills = await loadSkillsFromDirectory(resolveBundledSkillsDirectory())
    const compiler = skills.find((s) => s.id === 'workflow-compiler')
    const runtime = skills.find((s) => s.id === 'workflow-runtime')

    expect(compiler?.properties.visibility).toBe('workflow')
    expect(runtime?.properties.visibility).toBe('workflow')
    expect(compiler?.sections.instructions).toContain('Workflow compiler')
    expect(runtime?.sections.instructions).toContain('Workflow runtime')
  })
})
