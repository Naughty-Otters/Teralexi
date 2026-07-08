import { describe, expect, it, vi, beforeEach } from 'vitest'

const resolvePlanModeStorage = vi.hoisted(() => vi.fn())
const isCanonicalPlanMarkdownPath = vi.hoisted(() => vi.fn())

vi.mock('@main/agent/coding/plan-mode-storage-impl', () => ({
  planModeStorageOptionsFromEnv: vi.fn(() => ({ sandboxRoot: '/tmp/sandbox' })),
  resolvePlanModeStorage,
  isCanonicalPlanMarkdownPath,
}))

import { wrapPlanModeFileToolExecutes } from './plan-file-guard'

const storage = {
  sandboxRoot: '/tmp/sandbox',
  plansDirAbs: '/tmp/sandbox/plans',
  planFile: {
    absolutePath: '/tmp/sandbox/plans/test-plan.md',
    displayPath: 'plans/test-plan.md',
    slug: 'test-plan',
  },
  todosFile: {
    absolutePath: '/tmp/sandbox/plans/todos.json',
    displayPath: 'plans/todos.json',
  },
  manifestFile: {
    absolutePath: '/tmp/sandbox/plans/manifest.json',
    displayPath: 'plans/manifest.json',
  },
}

describe('wrapPlanModeFileToolExecutes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvePlanModeStorage.mockReturnValue(storage)
    isCanonicalPlanMarkdownPath.mockImplementation(
      (_storage, path: string) => path === 'plans/test-plan.md',
    )
  })

  it('no-ops when conversation id is missing', () => {
    const toolSet = {
      write_file: {
        needsApproval: true,
        async execute() {
          return { ok: true }
        },
      },
    }

    wrapPlanModeFileToolExecutes(toolSet, undefined)

    expect(resolvePlanModeStorage).not.toHaveBeenCalled()
    expect(toolSet.write_file.needsApproval).toBe(true)
  })

  it('no-ops when plan storage is unavailable', () => {
    resolvePlanModeStorage.mockReturnValue(null)
    const toolSet = {
      write_file: {
        async execute() {
          return { ok: true }
        },
      },
    }

    wrapPlanModeFileToolExecutes(toolSet, 'conv-1')

    expect(toolSet.write_file.execute).toBeDefined()
  })

  it('blocks writes outside the active plan file', async () => {
    const orig = vi.fn(async () => ({ ok: true }))
    const toolSet = {
      write_file: { needsApproval: true, execute: orig },
    }

    wrapPlanModeFileToolExecutes(toolSet, 'conv-1')

    expect(toolSet.write_file.needsApproval).toBe(false)
    const blocked = await toolSet.write_file.execute({ path: 'src/other.ts' })
    expect(blocked).toMatchObject({
      error: expect.stringContaining('Explore mode'),
    })
    expect(orig).not.toHaveBeenCalled()
  })

  it('allows writes to the canonical plan file', async () => {
    const orig = vi.fn(async () => ({ ok: true }))
    const toolSet = {
      edit_file: { execute: orig },
    }

    wrapPlanModeFileToolExecutes(toolSet, 'conv-1')

    const allowed = await toolSet.edit_file.execute({
      path: 'plans/test-plan.md',
      content: '# Plan',
    })
    expect(allowed).toEqual({ ok: true })
    expect(orig).toHaveBeenCalled()
  })

  it('passes apply_patch through when no file paths are extracted', async () => {
    const orig = vi.fn(async () => ({ ok: true }))
    const toolSet = {
      apply_patch: { execute: orig },
    }

    wrapPlanModeFileToolExecutes(toolSet, 'conv-1')

    const result = await toolSet.apply_patch.execute({
      path: 'README.md',
      patch: '...',
    })
    expect(result).toEqual({ ok: true })
    expect(orig).toHaveBeenCalled()
  })
})
