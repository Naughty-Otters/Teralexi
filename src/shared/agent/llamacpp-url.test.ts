import { describe, expect, it } from 'vitest'
import {
  LLAMACPP_DEFAULT_BASE_URL,
  normalizeLlamaCppBaseURL,
} from './llamacpp-url'

describe('normalizeLlamaCppBaseURL', () => {
  it('uses default when empty', () => {
    expect(normalizeLlamaCppBaseURL('')).toBe(LLAMACPP_DEFAULT_BASE_URL)
  })

  it('appends /v1 when missing', () => {
    expect(normalizeLlamaCppBaseURL('http://127.0.0.1:8080')).toBe(
      'http://127.0.0.1:8080/v1',
    )
  })

  it('preserves existing /v1 suffix', () => {
    expect(normalizeLlamaCppBaseURL('http://127.0.0.1:8080/v1/')).toBe(
      'http://127.0.0.1:8080/v1',
    )
  })
})
