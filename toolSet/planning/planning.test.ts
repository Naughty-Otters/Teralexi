import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  bindSandboxGlobalsForTools,
  captureSandboxGlobalsFromProcess,
  restoreSandboxGlobalsOnProcess,
} from '@main/agent/sandbox/sandbox-globals-lock'
import { enterPlanMode, exitPlanMode, parsePlanStepsFromMarkdown } from './index'

vi.mock('@main/agent/coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
  isPlanExecutionActive: vi.fn(() => false),
  planModeStorageOptionsFromEnv: vi.fn(() => ({ sandboxRoot: '/tmp/sandbox' })),
  bootstrapPlanModeStorage: vi.fn(() => ({
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
  })),
  planModeFor: vi.fn(() => ({
    activatePlanning: vi.fn(),
    activateExecution: vi.fn(),
  })),
}))

vi.mock('@main/agent/coding/explore-manifest', () => ({
  buildAndPersistExploreManifest: vi.fn(() => ({
    version: 1,
    updatedAt: '',
    conversationId: 'conv-plan-1',
    planSlug: 'test-plan',
    files: [],
  })),
  clearExploreManifest: vi.fn(),
}))

vi.mock('@main/agent/coding/plan-mode-storage-impl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/agent/coding/plan-mode-storage-impl')>()
  return {
  planModeStorageOptionsFromEnv: vi.fn(() => ({ sandboxRoot: '/tmp/sandbox' })),
  parsePlanStepsFromMarkdown: actual.parsePlanStepsFromMarkdown,
  planMarkdownHasActionableSteps: actual.planMarkdownHasActionableSteps,
  readPlanModeTodoList: vi.fn(() => ({ version: 1, updatedAt: '', todos: [] })),
  writePlanModeTodoList: vi.fn(),
  seedTodosFromPlanMarkdown: vi.fn(() => ({ seeded: 2 })),
  resolvePlanModeStorage: vi.fn(() => ({
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
  })),
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
  }
})

import { existsSync, readFileSync } from 'node:fs'
import { buildAndPersistExploreManifest } from '@main/agent/coding/explore-manifest'
import { planModeFor } from '@main/agent/coding/plan-mode-state'
import {
  readPlanModeTodoList,
  resolvePlanModeStorage,
} from '@main/agent/coding/plan-mode-storage-impl'

describe('planning tools', () => {
  let globalsSnapshot: ReturnType<typeof captureSandboxGlobalsFromProcess>

  beforeEach(() => {
    globalsSnapshot = captureSandboxGlobalsFromProcess()
    bindSandboxGlobalsForTools({
      root: mkdtempSync(join(tmpdir(), 'plan-tool-')),
      conversationId: 'conv-plan-1',
    })
    vi.mocked(planModeFor).mockClear()
  })

  afterEach(() => {
    restoreSandboxGlobalsOnProcess(globalsSnapshot)
  })

  it('enter_plan_mode activates plan mode for the active conversation', async () => {
    const result = await enterPlanMode.execute({ title: 'My feature' })
    expect(result).toMatchObject({
      ok: true,
      status: 'planning',
      planSlug: 'test-plan',
    })
    expect(planModeFor).toHaveBeenCalledWith('conv-plan-1')
    expect(vi.mocked(planModeFor).mock.results[0]?.value.activatePlanning).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'tool:enter_plan_mode' }),
    )
  })

  it('enter_plan_mode requires a conversation id', async () => {
    bindSandboxGlobalsForTools({ conversationId: undefined })
    const result = await enterPlanMode.execute({})
    expect(result).toEqual({
      error: 'enter_plan_mode requires an active conversation.',
    })
  })

  it('exit_plan_mode rejects template-only plan files', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(resolvePlanModeStorage).mockReturnValue({
      sandboxRoot: '/tmp/sandbox',
      plansDirAbs: '/tmp/sandbox/plans',
      planFile: {
        absolutePath: '/tmp/plans/test-plan.md',
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
    })
    vi.mocked(readFileSync).mockReturnValue(
      '## Steps\n1. <!-- Actionable step -->\n2. \n',
    )

    const result = await exitPlanMode.execute({ summary: 'Ready' })
    expect(result).toMatchObject({
      error: expect.stringContaining('update_todos'),
    })
  })

  it('exit_plan_mode seeds todos from plan steps', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(resolvePlanModeStorage).mockReturnValue({
      sandboxRoot: '/tmp/sandbox',
      plansDirAbs: '/tmp/sandbox/plans',
      planFile: {
        absolutePath: '/tmp/plans/test-plan.md',
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
    })

    vi.mocked(readFileSync).mockReturnValue('## Steps\n1. First step\n2. Second step\n')
    vi.mocked(readPlanModeTodoList)
      .mockReturnValueOnce({ version: 1, updatedAt: '', todos: [] })
      .mockReturnValue({
        version: 1,
        updatedAt: '',
        todos: [
          { content: 'First step', status: 'pending' },
          { content: 'Second step', status: 'pending' },
        ],
      })

    const result = await exitPlanMode.execute({ summary: 'Ready' })
    expect(result).toMatchObject({
      ok: true,
      status: 'plan_tool_execute',
      todosSeeded: 2,
      approvalSummary: 'Ready',
      todos: expect.any(Array),
    })
    expect(planModeFor).toHaveBeenCalledWith('conv-plan-1')
    expect(
      vi.mocked(planModeFor).mock.results.at(-1)?.value.activateExecution,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'tool:exit_plan_mode' }),
    )
    expect(buildAndPersistExploreManifest).toHaveBeenCalledWith(
      'conv-plan-1',
      'test-plan',
      { sandboxRoot: '/tmp/sandbox' },
    )
  })

  it('exit_plan_mode requires a conversation id', async () => {
    bindSandboxGlobalsForTools({ conversationId: undefined })
    const result = await exitPlanMode.execute({ summary: 'Ready' })
    expect(result).toEqual({
      error: 'exit_plan_mode requires an active conversation.',
    })
  })

  it('exit_plan_mode preserves existing todos instead of re-seeding', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(resolvePlanModeStorage).mockReturnValue({
      sandboxRoot: '/tmp/sandbox',
      plansDirAbs: '/tmp/sandbox/plans',
      planFile: {
        absolutePath: '/tmp/plans/test-plan.md',
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
    })
    vi.mocked(readFileSync).mockReturnValue('## Steps\n1. First step\n2. Second step\n')
    vi.mocked(readPlanModeTodoList)
      .mockReturnValue({
        version: 1,
        updatedAt: '',
        todos: [
          { id: 't1', content: 'First step', status: 'in_progress' },
          { id: 't2', content: 'Second step', status: 'pending' },
        ],
      })

    const result = await exitPlanMode.execute({ summary: 'Ready' })
    expect(result).toMatchObject({
      ok: true,
      todosSeeded: 0,
      todos: expect.arrayContaining([
        expect.objectContaining({ content: 'First step', status: 'in_progress' }),
      ]),
    })
  })

  it('exit_plan_mode includes warnings when todos lack success_criteria', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue('## Steps\n1. First step\n')
    vi.mocked(readPlanModeTodoList).mockReturnValue({
      version: 1,
      updatedAt: '',
      todos: [{ id: 't1', content: 'First step', status: 'pending' }],
    })

    const result = await exitPlanMode.execute({ summary: 'Ready' })
    expect(result).toMatchObject({
      ok: true,
      warnings: expect.arrayContaining([
        expect.stringContaining('no success_criteria'),
      ]),
    })
  })

  it('parsePlanStepsFromMarkdown extracts numbered steps', () => {
    const steps = parsePlanStepsFromMarkdown(
      '## Steps\n1. Alpha\n2. Beta\n## Files\n- x.ts',
    )
    expect(steps).toEqual(['Alpha', 'Beta'])
  })

  it('planMarkdownHasActionableSteps ignores template placeholders', async () => {
    const { planMarkdownHasActionableSteps } = await import('./plan-utils')
    expect(
      planMarkdownHasActionableSteps('## Steps\n1. <!-- Actionable step -->\n2. \n'),
    ).toBe(false)
    expect(planMarkdownHasActionableSteps('## Steps\n1. Ship feature\n')).toBe(true)
  })
})
