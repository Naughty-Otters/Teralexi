import { describe, expect, it, vi } from 'vitest'
import { runAgent } from './index'
import type { SkillTool } from '../types'

describe('runAgent', () => {
  it('returns null when no tools', async () => {
    expect(await runAgent([], {})).toBeNull()
  })

  it('runs tools and merges object results', async () => {
    const tools: SkillTool[] = [
      {
        name: 'add',
        description: 'add',
        execute: async (input) => ({ count: (input.count as number) + 1 }),
      },
      {
        name: 'finish',
        description: 'finish',
        execute: async () => ({ done: true }),
      },
    ]
    const out = (await runAgent(tools, { count: 0 }, 3)) as Array<{
      tool: string
    }>
    expect(out.length).toBeGreaterThan(0)
    expect(out.some((r) => r.tool === 'add')).toBe(true)
  })

  it('propagates tool errors instead of swallowing them', async () => {
    const tools: SkillTool[] = [
      {
        name: 'fail',
        description: 'fail',
        execute: async () => {
          throw new Error('nope')
        },
      },
    ]
    await expect(runAgent(tools, {}, 2)).rejects.toThrow('nope')
  })
})
