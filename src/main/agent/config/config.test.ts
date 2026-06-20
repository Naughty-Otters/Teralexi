import { describe, expect, it } from 'vitest'
import {
  buildToolPromptDescription,
  DEFAULT_RESPONSE_LANGUAGE,
  normalizeBaseURL,
  todoStatusIcon,
  withResponseLanguageInstruction,
} from '@main/agent/config'

describe('buildToolPromptDescription', () => {
  it('includes description, os, and approval lines', () => {
    const text = buildToolPromptDescription({
      name: 'run_script',
      description: 'Run script in sandbox',
      os: 'mac',
      needsApproval: true,
    })
    expect(text).toContain('Run script in sandbox')
    expect(text).toContain('mac')
    expect(text).toContain('true')
  })

  it('marks approval false when not required', () => {
    const text = buildToolPromptDescription({
      name: 'read_file',
      description: 'Read a file',
      needsApproval: false,
    })
    expect(text).toContain('false')
  })
})

describe('withResponseLanguageInstruction', () => {
  it('returns language instruction when prompt empty', () => {
    const out = withResponseLanguageInstruction(undefined, 'French')
    expect(out).toContain('French')
  })

  it('does not duplicate language instruction', () => {
    const first = withResponseLanguageInstruction('Hello', 'English')
    const second = withResponseLanguageInstruction(first, 'English')
    expect(second).toBe(first)
  })

  it('appends instruction to non-empty prompt', () => {
    const out = withResponseLanguageInstruction('Base prompt', 'Spanish')
    expect(out.startsWith('Base prompt')).toBe(true)
    expect(out).toContain('Spanish')
  })

  it('uses default language when blank', () => {
    const out = withResponseLanguageInstruction('Hi', '   ')
    expect(out).toContain(DEFAULT_RESPONSE_LANGUAGE)
  })
})

describe('normalizeBaseURL', () => {
  it('returns fallback for empty input', () => {
    expect(normalizeBaseURL('', 'http://localhost')).toBe('http://localhost')
  })

  it('trims trailing slash', () => {
    expect(normalizeBaseURL('https://api.example.com/', 'x')).toBe(
      'https://api.example.com',
    )
  })
})

describe('todoStatusIcon', () => {
  it('maps known statuses', () => {
    expect(todoStatusIcon('pending')).toBe('⏳')
    expect(todoStatusIcon('in-progress')).toBe('🔄')
    expect(todoStatusIcon('completed')).toBe('✅')
    expect(todoStatusIcon('failed')).toBe('❌')
  })
})
