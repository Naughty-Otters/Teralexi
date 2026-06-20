import { describe, expect, it } from 'vitest'
import { readSkillInstructionsFromMarkdown } from './workflow-skills'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { resolveBundledSkillsDirectory } from '@main/skills/skill-path'
import { WORKFLOW_COMPILER_TOOL_NAMES } from './workflow-source-scope'

const workflowCompilerSkillFolder = join(
  resolveBundledSkillsDirectory(),
  'workflow-compiler',
)
const hasBundledWorkflowCompilerSkill = existsSync(
  join(workflowCompilerSkillFolder, 'skill.md'),
)
const workflowCompilerTest = hasBundledWorkflowCompilerSkill ? it : it.skip

describe('workflow-skills', () => {
  it('reads Instructions section from markdown content', () => {
    const raw = `## Instructions\n\nUse write_workflow_definition for workflow_definition.json and add_entity_field for entities.\n`
    const instructions = readSkillInstructionsFromMarkdown(raw)
    expect(instructions).toContain('write_workflow_definition')
    expect(instructions).toContain('workflow_definition.json')
    expect(instructions).toContain('add_entity_field')
  })

  workflowCompilerTest('reads compiler instructions from bundled skill.md', () => {
    const raw = readFileSync(
      join(resolveBundledSkillsDirectory(), 'workflow-compiler', 'skill.md'),
      'utf-8',
    )
    const instructions = readSkillInstructionsFromMarkdown(raw)
    expect(instructions).toContain('write_workflow_definition')
    expect(instructions).toContain('workflow_definition.json')
    expect(instructions).toContain('add_entity_field')
  })

  it('loads scoped file tools from actions when workflow compiler skill exists', async () => {
    const { loadSkillActions } = await import('@main/skills/skill-module-loader')
    const tools = await loadSkillActions(
      join(resolveBundledSkillsDirectory(), 'workflow-compiler'),
      [],
    )
    if (!hasBundledWorkflowCompilerSkill) {
      expect(tools).toEqual([])
      return
    }
    expect(tools.length).toBe(WORKFLOW_COMPILER_TOOL_NAMES.length)
    expect(tools.some((t) => t.name === 'list_workflow_files')).toBe(true)
    expect(tools.some((t) => t.name === 'add_entity_field')).toBe(true)
  })
})
