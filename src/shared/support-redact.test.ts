import { describe, expect, it } from 'vitest'
import {
  redactPropertiesFile,
  redactRecord,
  shouldRedactPropertyKey,
} from './support-redact'

describe('support-redact', () => {
  it('redacts secret-like keys', () => {
    expect(shouldRedactPropertyKey('settings.telegram.botToken')).toBe(true)
    expect(shouldRedactPropertyKey('app.google.clientSecret')).toBe(true)
    expect(shouldRedactPropertyKey('memory.recording.block')).toBe(false)
  })

  it('redacts records and properties files', () => {
    expect(
      redactRecord({
        'llm.openai.apiKey': 'sk-test-key-1234567890',
        'user.displayName': 'openfde User',
      }),
    ).toEqual({
      'llm.openai.apiKey': '[REDACTED]',
      'user.displayName': 'openfde User',
    })

    const redacted = redactPropertiesFile(
      'app.google.clientSecret=super-secret\nmemory.recording.block=true\n',
    )
    expect(redacted).toContain('app.google.clientSecret=[REDACTED]')
    expect(redacted).toContain('memory.recording.block=true')
  })
})
