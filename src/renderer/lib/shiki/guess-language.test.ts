import { describe, expect, it } from 'vitest'
import {
  guessLanguageFromCode,
  languageForTerminalSlot,
  languageFromFilePath,
} from './guess-language'

describe('guess-language', () => {
  it('maps file extensions', () => {
    expect(languageFromFilePath('src/foo.ts')).toBe('typescript')
    expect(languageFromFilePath('README.md')).toBe('markdown')
    expect(languageFromFilePath('patch.diff')).toBe('diff')
  })

  it('detects json payloads', () => {
    expect(guessLanguageFromCode('{"a":1}')).toBe('json')
  })

  it('detects shell shebang', () => {
    expect(guessLanguageFromCode('#!/bin/bash\necho hi')).toBe('bash')
  })

  it('maps terminal slots', () => {
    expect(languageForTerminalSlot('command')).toBe('bash')
    expect(languageForTerminalSlot('output')).toBe('text')
  })
})
