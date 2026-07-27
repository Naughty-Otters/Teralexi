import { describe, expect, it } from 'vitest'
import { normalizeHookEvent } from './hook-event-aliases'

describe('normalizeHookEvent', () => {
  it('maps PreToolUse to beforeToolCall', () => {
    expect(normalizeHookEvent('PreToolUse')).toBe('beforeToolCall')
  })

  it('maps PostToolUse to afterToolCall', () => {
    expect(normalizeHookEvent('PostToolUse')).toBe('afterToolCall')
  })

  it('maps PermissionRequest to onApprovalRequired', () => {
    expect(normalizeHookEvent('PermissionRequest')).toBe('onApprovalRequired')
  })

  it('passes through canonical names', () => {
    expect(normalizeHookEvent('preHook')).toBe('preHook')
  })
})
