import { describe, expect, it } from 'vitest'
import { buildCatchAllToolApproval } from './tool-approval-policy'

describe('buildCatchAllToolApproval', () => {
  const approve = buildCatchAllToolApproval({
    alwaysRequireApproval: ['shell'],
  })

  it('requires approval for tools with needsApproval', () => {
    expect(
      approve({
        toolCall: { toolName: 'edit_files' },
        tools: { edit_files: { needsApproval: true } },
      }),
    ).toBe('user-approval')
  })

  it('allows tools that session approval cleared', () => {
    expect(
      approve({
        toolCall: { toolName: 'edit_files' },
        tools: { edit_files: { needsApproval: false } },
      }),
    ).toBeUndefined()
  })

  it('requires approval for dynamic tools', () => {
    expect(
      approve({
        toolCall: { toolName: 'mcp_unknown', dynamic: true },
        tools: {},
      }),
    ).toBe('user-approval')
  })

  it('requires approval for alwaysRequireApproval list', () => {
    expect(
      approve({
        toolCall: { toolName: 'shell' },
        tools: { shell: { needsApproval: false } },
      }),
    ).toBe('user-approval')
  })
})
