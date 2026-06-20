import { describe, expect, it, vi, beforeEach } from 'vitest'
import { applyRuntimePlanModeGate } from './plan-mode-runtime-gate'

vi.mock('./plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => true),
  resolvePlanModeStorage: vi.fn(() => ({
    sandboxRoot: '/ws',
    plansDirAbs: '/ws/plans',
    planFile: {
      absolutePath: '/ws/plans/test.md',
      displayPath: 'plans/test.md',
      slug: 'test',
    },
    todosFile: {
      absolutePath: '/ws/plans/todos.json',
      displayPath: 'plans/todos.json',
    },
    manifestFile: {
      absolutePath: '/ws/plans/manifest.json',
      displayPath: 'plans/manifest.json',
    },
  })),
}))

import { isPlanModeActive } from './plan-mode-state'

describe('applyRuntimePlanModeGate', () => {
  beforeEach(() => {
    vi.mocked(isPlanModeActive).mockReturnValue(true)
  })

  it('blocks mutating tools when plan mode becomes active mid-stream', async () => {
    const toolSet = {
      read_file: {
        async execute() {
          return { ok: true }
        },
      },
      run_workspace_command: {
        async execute() {
          return { ok: true }
        },
      },
    }
    applyRuntimePlanModeGate(toolSet, 'conv-1', 'coding', 0)

    const blocked = await toolSet.run_workspace_command.execute({})
    expect(blocked).toMatchObject({ error: expect.stringContaining('Explore mode') })

    const allowed = await toolSet.read_file.execute({})
    expect(allowed).toEqual({ ok: true })
  })

  it('passes through when plan mode is inactive', async () => {
    vi.mocked(isPlanModeActive).mockReturnValue(false)
    const toolSet = {
      run_workspace_command: {
        async execute() {
          return { ran: true }
        },
      },
    }
    applyRuntimePlanModeGate(toolSet, 'conv-1', 'coding', 0)
    expect(await toolSet.run_workspace_command.execute({})).toEqual({ ran: true })
  })

  it('blocks run_script during plan mode', async () => {
    const toolSet = {
      read_file: {
        async execute() {
          return { ok: true }
        },
      },
      run_script: {
        async execute() {
          return { ran: true }
        },
      },
    }
    applyRuntimePlanModeGate(toolSet, 'conv-1', 'coding', 0)

    expect(await toolSet.run_script.execute({})).toMatchObject({
      error: expect.stringContaining('Explore mode'),
    })
    expect(await toolSet.read_file.execute({})).toEqual({ ok: true })
  })

  it('allows web research tools during plan mode', async () => {
    const toolSet = {
      web_search: {
        async execute() {
          return { results: [] }
        },
      },
      web_scrape: {
        async execute() {
          return { content: 'page' }
        },
      },
    }
    applyRuntimePlanModeGate(toolSet, 'conv-1', 'coding', 0)

    expect(await toolSet.web_search.execute({})).toEqual({ results: [] })
    expect(await toolSet.web_scrape.execute({})).toEqual({ content: 'page' })
  })

  it('blocks mutating tools for non-coding skills in plan mode', async () => {
    const toolSet = {
      read_file: {
        async execute() {
          return { ok: true }
        },
      },
      custom_skill_tool: {
        async execute() {
          return { ran: true }
        },
      },
    }
    applyRuntimePlanModeGate(toolSet, 'conv-1', 'documents', 0)

    const blocked = await toolSet.custom_skill_tool.execute({})
    expect(blocked).toMatchObject({ error: expect.stringContaining('Explore mode') })

    const allowed = await toolSet.read_file.execute({})
    expect(allowed).toEqual({ ok: true })
  })

  it('skips explore gating for sub-agent runs', async () => {
    const toolSet = {
      run_script: {
        async execute() {
          return { ran: true }
        },
      },
    }
    applyRuntimePlanModeGate(toolSet, 'conv-1', 'coding', 1)
    expect(await toolSet.run_script.execute({})).toEqual({ ran: true })
  })
})
