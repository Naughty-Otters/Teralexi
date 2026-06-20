import { describe, expect, it } from 'vitest'
import {
  SKILL_DEFAULT_PROPERTIES,
  SKILL_FILES,
  SKILL_LOADER_LOG,
  SKILL_MODULE,
  SKILLS_RESERVED_DIR_NAMES,
} from './constants'

describe('skills constants', () => {
  it('reserves shared directories under skills/', () => {
    expect(SKILLS_RESERVED_DIR_NAMES).not.toContain('toolSet')
    expect(SKILLS_RESERVED_DIR_NAMES).toContain('node_modules')
  })

  it('defines skill file names', () => {
    expect(SKILL_FILES.SKILL_MD).toBe('skill.md')
    expect(SKILL_FILES.TOOL_SET_DIR).toBe('toolSet')
  })

  it('defines defaults and loader messages', () => {
    expect(SKILL_DEFAULT_PROPERTIES.PROVIDER).toBe('ollama')
    expect(SKILL_LOADER_LOG.LOADED).toMatch(/Loaded skills/)
    expect(SKILL_MODULE.CACHE_DIR).toContain('skill-module-cache')
  })
})
