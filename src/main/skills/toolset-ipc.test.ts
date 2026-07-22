import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { loadToolSetTools } from './skill-module-loader'
import { serializeNeedsApproval } from './tool-ipc-meta'
import { extractZodParams } from '@main/utils/zod-introspection'

describe('toolSet IPC metadata', () => {
  it('loadToolSetTools includes lean shared tools and excludes skill-owned tools', async () => {
    const tools = await loadToolSetTools()
    expect(tools.length).toBeGreaterThan(8)
    expect(tools.some((t) => t.name === 'read_file')).toBe(true)
    expect(tools.some((t) => t.name === 'edit_files')).toBe(true)
    expect(tools.some((t) => t.name === 'shell')).toBe(true)
    expect(tools.some((t) => t.name === 'generate_follow_up')).toBe(true)
    expect(tools.some((t) => t.name === 'git_status')).toBe(false)
    expect(tools.some((t) => t.name === 'best_of_n')).toBe(false)
    expect(tools.some((t) => t.name === 'run_script')).toBe(true)
    expect(tools.some((t) => t.name === 'run_script_file')).toBe(true)
    expect(tools.some((t) => t.name === 'shell')).toBe(true)
    // GitHub and Google tools remain skill-owned (live under skills/*/actions).
    expect(tools.some((t) => t.name === 'github_auth_status')).toBe(false)
    expect(tools.some((t) => t.name === 'google_workspace_auth_status')).toBe(
      false,
    )
  })

  it('every tool can be serialized for ListToolSetTools IPC', async () => {
    const tools = await loadToolSetTools()
    for (const tool of tools) {
      const row = {
        name: tool.name,
        tags: tool.tags ?? ['toolSet'],
        description: tool.description,
        needsApproval: serializeNeedsApproval(tool.needsApproval),
        params: extractZodParams(tool.inputSchema),
      }
      expect(() => structuredClone(row)).not.toThrow()
    }
  })

  it('serializeNeedsApproval converts function handlers', () => {
    expect(serializeNeedsApproval(() => false)).toBe(true)
    expect(structuredClone({ ok: serializeNeedsApproval(() => true) })).toEqual({
      ok: true,
    })
    expect(() =>
      structuredClone({ bad: (() => true) as unknown as boolean }),
    ).toThrow()
  })

  it('extractZodParams handles github_api record fields', () => {
    const schema = z.object({
      method: z.enum(['GET', 'POST']).optional(),
      endpoint: z.string(),
      fields: z.record(z.string(), z.string()).optional(),
    })
    expect(() => extractZodParams(schema)).not.toThrow()
  })
})
