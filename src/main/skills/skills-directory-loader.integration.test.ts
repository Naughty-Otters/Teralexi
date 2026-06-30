import { describe, expect, it, vi } from 'vitest'

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getEffectiveSkillCompilation: vi.fn(() => null),
  }),
}))

import { loadToolSetTools } from './skill-module-loader'

describe('bundled skills (integration)', () => {
  it('scopes google_* tools to google-workspace skill only', async () => {
    const globalTools = await loadToolSetTools()
    const { buildBundledSkillDefinitions } = await import('./bundled-skills')
    const skills = await buildBundledSkillDefinitions(globalTools)
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

  it('default skill is sandbox-only without file or git tools', async () => {
    const globalTools = await loadToolSetTools()
    const { buildBundledSkillDefinitions } = await import('./bundled-skills')
    const skills = await buildBundledSkillDefinitions(globalTools)
    const defaultSkill = skills.find((s) => s.id === 'default')

    expect(defaultSkill).toBeDefined()
    expect(defaultSkill?.tools.some((t) => t.name === 'run_script')).toBe(true)
    expect(defaultSkill?.tools.some((t) => t.name === 'web_search')).toBe(true)
    expect(defaultSkill?.tools.some((t) => t.name === 'read_file')).toBe(false)
    expect(defaultSkill?.tools.some((t) => t.name === 'git_status')).toBe(false)
  })

  it('documents catalog is allowed toolSet plus action tools only', async () => {
    const globalTools = await loadToolSetTools()
    const { buildBundledSkillDefinitions } = await import('./bundled-skills')
    const skills = await buildBundledSkillDefinitions(globalTools)
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

})
