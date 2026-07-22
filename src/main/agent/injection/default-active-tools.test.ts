import { describe, expect, it } from 'vitest'
import { resolveDefaultActiveToolNames } from '../coding/default-active-tools'
import { mergePrepareStepSlicesForTests } from './pipeline'
import { createMtimeKeyedCache } from './injector-cache'

describe('resolveDefaultActiveToolNames', () => {
  it('includes tag-matched, MCP, mandatory, and skill-native tools only', () => {
    const catalog = [
      { name: 'read_file', tags: ['file-system'] },
      { name: 'write_file', tags: ['file-system'] },
      { name: 'web_search', tags: ['web'] },
      { name: 'publish_website', tags: [] },
      { name: 'mcp_foo', source: 'mcp' as const },
      { name: 'update_todos', tags: ['task-tracking'] },
    ]
    const active = resolveDefaultActiveToolNames({
      skillId: 'website',
      allToolNames: catalog.map((t) => t.name),
      catalogTools: catalog,
      skillNativeToolNames: ['publish_website'],
    })
    expect(active).toContain('read_file')
    expect(active).toContain('publish_website')
    expect(active).toContain('mcp_foo')
    expect(active).toContain('update_todos')
    expect(active).not.toContain('web_search')
  })

  it('coding skill uses mandatory tools only (no tag expansion)', () => {
    const catalog = [
      { name: 'read_file', tags: ['file-system'] },
      { name: 'apply_patch', tags: ['file-system'] },
      { name: 'update_todos', tags: ['task-tracking'] },
      { name: 'enter_plan_mode', tags: ['planning'] },
      { name: 'shell', tags: ['file-system', 'workspace'] },
      { name: 'web_search', tags: ['web'] },
      { name: 'invoke_agents', tags: ['sub-agents'] },
    ]
    const active = resolveDefaultActiveToolNames({
      skillId: 'coding',
      allToolNames: catalog.map((t) => t.name),
      catalogTools: catalog,
    })
    expect(active).toContain('update_todos')
    expect(active).toContain('enter_plan_mode')
    expect(active).toContain('invoke_agents')
    expect(active).not.toContain('read_file')
    expect(active).not.toContain('web_search')
    expect(active).not.toContain('shell')
  })
})

describe('mergePrepareStepSlices activeTools intersect', () => {
  it('intersects non-empty activeTools lists', () => {
    const merged = mergePrepareStepSlicesForTests([
      { activeTools: ['a', 'b', 'c'] },
      { activeTools: ['b', 'c', 'd'] },
    ])
    expect(merged?.activeTools?.sort()).toEqual(['b', 'c'])
  })
})

describe('injector mtime cache', () => {
  it('returns cached value for the same key', () => {
    const cache = createMtimeKeyedCache<string>()
    let calls = 0
    const first = cache.getOrCompute(['k'], () => {
      calls += 1
      return 'v1'
    })
    const second = cache.getOrCompute(['k'], () => {
      calls += 1
      return 'v2'
    })
    expect(first).toBe('v1')
    expect(second).toBe('v1')
    expect(calls).toBe(1)
  })
})
