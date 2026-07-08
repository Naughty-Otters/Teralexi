import { describe, expect, it } from 'vitest'
import { loadToolSetTools } from './skill-module-loader'
import {
  getBundledSkillIds,
  readBundledSkillAttachment,
} from './bundled-skills-manifest'
import { getBundledSkillActionTools } from './bundled-skill-actions'

describe('bundled-skills', () => {
  it('includes all shipped bundled skill ids', () => {
    expect(getBundledSkillIds().sort()).toEqual([
      'coding',
      'coding-pr',
      'coding-review',
      'default',
      'documents',
      'google-workspace',
      'research',
      'website',
    ])
  })

  it('builds skill definitions with action tools', async () => {
    await loadToolSetTools()
    const { buildBundledSkillDefinitions } = await import('./bundled-skills')
    const skills = await buildBundledSkillDefinitions([])
    expect(skills.length).toBeGreaterThanOrEqual(7)
    const documents = skills.find((skill) => skill.id === 'documents')
    expect(documents?.actionToolNames).toContain('render_document')
    expect(documents?.sections.instructions.length).toBeGreaterThan(0)
  })

  it('loads bundled action tools by skill id', async () => {
    await loadToolSetTools()
    const tools = getBundledSkillActionTools('research')
    expect(tools.map((tool) => tool.name)).toEqual(['export_research_pdf'])
    const websiteTools = getBundledSkillActionTools('website')
    expect(websiteTools.map((tool) => tool.name).sort()).toEqual([
      'render_website',
      'validate_website',
    ])
  })

  it('reads bundled attachments from memory', () => {
    const body = readBundledSkillAttachment('documents', 'templates/manifest.json')
    expect(body.encoding).toBe('utf8')
    expect(body.content).toContain('"templates"')
  })
})
