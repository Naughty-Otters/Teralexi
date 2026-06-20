import { describe, expect, it } from 'vitest'
import { monacoLanguageFromPath } from './monaco-language'

describe('monacoLanguageFromPath', () => {
  it('maps common extensions', () => {
    expect(monacoLanguageFromPath('src/app.ts')).toBe('typescript')
    expect(monacoLanguageFromPath('index.js')).toBe('javascript')
    expect(monacoLanguageFromPath('README.md')).toBe('markdown')
    expect(monacoLanguageFromPath('styles/main.css')).toBe('css')
    expect(monacoLanguageFromPath('config.json')).toBe('json')
  })

  it('falls back to plaintext', () => {
    expect(monacoLanguageFromPath('notes.txt')).toBe('plaintext')
    expect(monacoLanguageFromPath('noext')).toBe('plaintext')
  })
})
