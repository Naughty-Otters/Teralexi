import { describe, expect, it } from 'vitest'
import {
  applyAdditionalContextToSystemPrompt,
  applyAdditionalContextToToolResult,
  applyUpdatedInput,
  mapPermissionDecision,
} from './hook-result-applier'

describe('hook-result-applier', () => {
  it('merges updatedInput into tool input', () => {
    const result = applyUpdatedInput({ path: '/a' }, {
      blocked: false,
      hookSpecificOutput: { updatedInput: { path: '/b' } },
    })
    expect(result).toEqual({ path: '/b' })
  })

  it('appends additional context to system prompt', () => {
    expect(
      applyAdditionalContextToSystemPrompt('base', ['extra']),
    ).toBe('base\n\nextra')
  })

  it('attaches hook context to tool result objects', () => {
    expect(
      applyAdditionalContextToToolResult({ ok: true }, 'note'),
    ).toEqual({ ok: true, _hookContext: 'note' })
  })

  it('maps permission decisions', () => {
    expect(mapPermissionDecision('allow')).toBe('approved')
    expect(mapPermissionDecision('deny')).toBe('denied')
    expect(mapPermissionDecision('ask')).toBe('user-approval')
  })
})
