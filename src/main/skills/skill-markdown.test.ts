import { describe, expect, it } from 'vitest'
import {
  buildSystemPrompt,
  extractBullets,
  extractExamples,
  extractSection,
  extractInstructions,
  extractTools,
  parseFrontmatter,
  parseCommaSeparatedToolList,
  parseSkillMarkdown,
} from './skill-markdown'

describe('parseFrontmatter', () => {
  it('parses booleans and strings', () => {
    expect(
      parseFrontmatter('name: Demo\nenabled: true\nmodel: gpt-4'),
    ).toEqual({
      name: 'Demo',
      enabled: true,
      model: 'gpt-4',
    })
  })
})

describe('extractSection', () => {
  it('returns body until next heading', () => {
    const md = '## Instructions\nDo A\n\n## Report\nLater'
    expect(extractSection(md, 'Instructions')).toBe('Do A')
    expect(extractSection(md, 'Missing')).toBe('')
  })
})

describe('extractInstructions', () => {
  it('uses full body when Instructions section is missing', () => {
    const md = '# Demo skill\n\nDo the thing.\n\n## Tools\n- read_file'
    expect(extractInstructions(md)).toBe(md.trim())
  })

  it('prefers Instructions section when present', () => {
    const md = '## Instructions\nRun tools\n\n## Tools\n- read_file'
    expect(extractInstructions(md)).toBe('Run tools')
  })
})

describe('extractBullets and extractTools', () => {
  it('collects bullet lines', () => {
    expect(extractBullets('- one\n* two')).toEqual(['one', 'two'])
  })

  it('normalizes tool names from bullets or comma list', () => {
    expect(extractTools('- `read_file`\n- write_file:desc')).toEqual([
      'read_file',
      'write_file',
    ])
    expect(extractTools('a, b')).toEqual(['a', 'b'])
  })
})

describe('extractExamples', () => {
  it('parses user/assistant pairs', () => {
    const text = '### User\nHi\n### Assistant\nHello'
    expect(extractExamples(text)).toEqual([{ user: 'Hi', assistant: 'Hello' }])
  })
})

describe('buildSystemPrompt', () => {
  it('includes instructions and examples', () => {
    const prompt = buildSystemPrompt({
      fullMarkdown: 'Base',
      instructions: 'Base',
      summary: '',
      report: '',
      examples: [{ user: 'Q', assistant: 'A' }],
      tools: [],
    })
    expect(prompt).toContain('Base')
    expect(prompt).toContain('Q')
    expect(prompt).toContain('A')
  })
})

describe('parseCommaSeparatedToolList', () => {
  it('parses comma-separated tool names with optional backticks', () => {
    expect(parseCommaSeparatedToolList('read_file, `write_file`')).toEqual([
      'read_file',
      'write_file',
    ])
    expect(parseCommaSeparatedToolList('')).toEqual([])
  })
})

describe('parseSkillMarkdown', () => {
  it('returns null when required fields missing', () => {
    expect(
      parseSkillMarkdown('id', '/tmp', 'name: only', '# skill'),
    ).toBeNull()
  })

  it('uses full skill body when Instructions section is absent', () => {
    const properties = [
      'name: Demo',
      'model: llama',
      'provider: ollama',
    ].join('\n')
    const skill = '# Title\n\nRun everything in this file.'
    const parsed = parseSkillMarkdown('demo', '/tmp/demo', properties, skill)
    expect(parsed?.sections.instructions).toBe(skill)
  })

  it('builds skill definition from properties and sections', () => {
    const properties = [
      'name: Demo',
      'model: llama',
      'provider: ollama',
    ].join('\n')
    const skill = [
      '## Instructions',
      'Run tools',
      '## Tools',
      '- read_file',
    ].join('\n')
    const resolved = [
      { name: 'read_file', description: 'Read', execute: async () => null },
      { name: 'write_file', description: 'Write', execute: async () => null },
    ]
    const parsed = parseSkillMarkdown(
      'demo',
      '/tmp/demo',
      properties,
      skill,
      undefined,
      undefined,
      resolved,
    )
    expect(parsed?.id).toBe('demo')
    expect(parsed?.sections.instructions).toBe('Run tools')
    expect(parsed?.sections.fullMarkdown).toBe(skill)
    expect(parsed?.sections.tools).toEqual(['read_file'])
    expect(parsed?.tools).toEqual(resolved)
  })

  it('parses allowed_tools from properties into allowedTools', () => {
    const properties = [
      'name: Demo',
      'model: llama',
      'provider: ollama',
      'allowed_tools: read_file, git_status',
    ].join('\n')
    const parsed = parseSkillMarkdown(
      'demo',
      '/tmp/demo',
      properties,
      '## Instructions\nRun',
    )
    expect(parsed?.properties.allowedTools).toEqual(['read_file', 'git_status'])
  })
})
