import { describe, expect, it } from 'vitest'
import {
  SKILL_MARKDOWN_LLM,
  SKILL_MARKDOWN_SECTIONS,
  buildDefaultPropertiesYaml,
} from './llm-constants'
import { SKILL_DEFAULT_PROPERTIES } from './constants'

describe('skills llm-constants', () => {
  it('exports markdown section keys', () => {
    expect(SKILL_MARKDOWN_SECTIONS.INSTRUCTIONS).toBe('Instructions')
    expect(SKILL_MARKDOWN_LLM.EXAMPLES_SECTION).toContain('Examples')
  })

  it('builds default properties yaml', () => {
    const yaml = buildDefaultPropertiesYaml('My Skill', 'my-skill')
    expect(yaml).toContain('name: My Skill')
    expect(yaml).toContain(`model: ${SKILL_DEFAULT_PROPERTIES.MODEL}`)
    expect(yaml).toContain(`provider: ${SKILL_DEFAULT_PROPERTIES.PROVIDER}`)
  })

  it('falls back to skill id for display name', () => {
    const yaml = buildDefaultPropertiesYaml('', 'fallback-id')
    expect(yaml.startsWith('name: fallback-id')).toBe(true)
  })
})
