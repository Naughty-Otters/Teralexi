import { describe, expect, it } from 'vitest'
import { buildCatchAllToolApproval } from './tool-approval-policy'

describe('buildCatchAllToolApproval', () => {
  const approve = buildCatchAllToolApproval({
    alwaysRequireApproval: ['shell'],
  })

  it('requires approval for tools with needsApproval', async () => {
    await expect(
      approve({
        toolCall: { toolName: 'edit_files' },
        tools: { edit_files: { needsApproval: true } },
      }),
    ).resolves.toBe('user-approval')
  })

  it('allows tools that session approval cleared', async () => {
    await expect(
      approve({
        toolCall: { toolName: 'edit_files' },
        tools: { edit_files: { needsApproval: false } },
      }),
    ).resolves.toBeUndefined()
  })

  it('requires approval for dynamic tools', async () => {
    await expect(
      approve({
        toolCall: { toolName: 'mcp_unknown', dynamic: true },
        tools: {},
      }),
    ).resolves.toBe('user-approval')
  })

  it('requires approval for alwaysRequireApproval list', async () => {
    await expect(
      approve({
        toolCall: { toolName: 'shell' },
        tools: { shell: { needsApproval: false } },
      }),
    ).resolves.toBe('user-approval')
  })
})
