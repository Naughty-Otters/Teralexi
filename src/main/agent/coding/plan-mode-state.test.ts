import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'

const { planState } = vi.hoisted(() => {
  const planState: AgentPlanModeState = {
    status: 'planning',
    planSlug: null,
  }
  return { planState }
})

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

vi.mock('@main/services/web-content-send', () => ({
  webContentSend: {
    PlanModeStateChanged: vi.fn(),
  },
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getConversationPlanModeState: vi.fn(() => ({ ...planState })),
    setConversationPlanModeState: vi.fn(
      (_id: string, next: AgentPlanModeState) => {
        Object.assign(planState, next)
      },
    ),
  })),
}))

import {
  bootstrapPlanModeStorage,
  clearPlanMode,
  consumePendingPlanActivation,
  consumePendingPlanExecution,
  getPlanModeStateForConversation,
  getPlanModeView,
  hasPendingPlanActivation,
  hasPendingPlanExecution,
  isPlanExecutionActive,
  isPlanModeActive,
  isPlanFileWritten,
  readPlanModeTodoList,
  writePlanModeTodoList,
} from './plan-mode-state'
import { renderPlanMarkdownFromTodoList } from './plan-mode-template'
import { emptyTodoList, replaceTodos } from '@shared/agent/todos'

describe('plan-mode storage', () => {
  let sandboxRoot: string

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'plan-state-'))
    Object.assign(planState, {
      status: 'planning',
      planSlug: null,
    })
  })

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true })
  })

  it('bootstrapPlanModeStorage creates co-located plan and todos paths', () => {
    const storage = bootstrapPlanModeStorage('conv-1', 'My Feature', {
      sandboxRoot,
    })
    expect(storage?.planFile.displayPath).toMatch(/^plans\/.+\.md$/)
    expect(storage?.todosFile.displayPath).toBe('plans/todos.json')
    expect(planState.planSlug).toBe('my-feature')
    expect(readFileSync(storage!.planFile.absolutePath, 'utf8')).toBe(
      renderPlanMarkdownFromTodoList(emptyTodoList()),
    )
  })

  it('keeps the first plan slug when enter_plan_mode is called again with a new title', () => {
    bootstrapPlanModeStorage('conv-1', 'Old Plan', { sandboxRoot })
    const storage = bootstrapPlanModeStorage('conv-1', 'Auth Refactor', {
      sandboxRoot,
    })
    expect(planState.planSlug).toBe('old-plan')
    expect(storage?.planFile.slug).toBe('old-plan')
  })

  it('prunes extra plan markdown files so only the canonical plan remains', () => {
    const storage = bootstrapPlanModeStorage('conv-1', 'feature', {
      sandboxRoot,
    })
    const plansDir = join(sandboxRoot, 'plans')
    writeFileSync(join(plansDir, 'extra-plan.md'), '# stray\n', 'utf8')
    writeFileSync(join(plansDir, 'another.md'), '# stray\n', 'utf8')

    writePlanModeTodoList(
      'conv-1',
      replaceTodos([{ content: 'Step one', status: 'pending' }]),
      { sandboxRoot },
    )

    expect(existsSync(storage!.planFile.absolutePath)).toBe(true)
    expect(existsSync(join(plansDir, 'extra-plan.md'))).toBe(false)
    expect(existsSync(join(plansDir, 'another.md'))).toBe(false)
    expect(
      readdirSync(plansDir).filter((name) => name.endsWith('.md')),
    ).toEqual([`${planState.planSlug}.md`])
  })

  it('read/write plan mode todos under plans/todos.json', () => {
    bootstrapPlanModeStorage('conv-1', 'feature', { sandboxRoot })
    const list = replaceTodos([{ content: 'Step one', status: 'pending' }])
    writePlanModeTodoList('conv-1', list, { sandboxRoot })
    const read = readPlanModeTodoList('conv-1', { sandboxRoot })
    expect(read.todos).toHaveLength(1)
    expect(read.todos[0]?.content).toBe('Step one')
    const planMd = readFileSync(
      join(sandboxRoot, 'plans', planState.planSlug + '.md'),
      'utf8',
    )
    expect(planMd).toContain('1. Step one')
  })

  it('isPlanFileWritten rejects template-only content', () => {
    const path = join(sandboxRoot, 'template.md')
    writeFileSync(path, renderPlanMarkdownFromTodoList(emptyTodoList()), 'utf8')
    expect(isPlanFileWritten(path)).toBe(false)
  })

  it('isPlanFileWritten accepts actionable steps', () => {
    const path = join(sandboxRoot, 'real.md')
    writeFileSync(path, '## Steps\n1. Implement auth\n', 'utf8')
    expect(isPlanFileWritten(path)).toBe(true)
  })

  it('migrates legacy output/plans into canonical plans/', () => {
    bootstrapPlanModeStorage('conv-1', 'feature', { sandboxRoot })
    const legacyDir = join(sandboxRoot, 'output', 'plans')
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(
      join(legacyDir, 'feature.md'),
      '## Steps\n1. Legacy step\n',
      'utf8',
    )
    writeFileSync(
      join(legacyDir, 'todos.json'),
      JSON.stringify({
        version: 1,
        updatedAt: 't',
        todos: [{ content: 'Legacy output task', status: 'pending' }],
      }),
      'utf8',
    )

    const read = readPlanModeTodoList('conv-1', { sandboxRoot })
    expect(read.todos).toHaveLength(1)
    expect(read.todos[0]?.content).toBe('Legacy output task')
    expect(existsSync(join(sandboxRoot, 'plans', 'feature.md'))).toBe(true)
    expect(existsSync(join(sandboxRoot, 'plans', 'todos.json'))).toBe(true)
  })

  it('migrates legacy sandbox-root todos.json into plans/todos.json', () => {
    writeFileSync(
      join(sandboxRoot, 'todos.json'),
      JSON.stringify({
        version: 1,
        updatedAt: 't',
        todos: [{ content: 'Legacy task', status: 'pending' }],
      }),
      'utf8',
    )
    bootstrapPlanModeStorage('conv-1', 'feature', { sandboxRoot })
    const read = readPlanModeTodoList('conv-1', { sandboxRoot })
    expect(read.todos).toHaveLength(1)
    expect(read.todos[0]?.content).toBe('Legacy task')
    expect(existsSync(join(sandboxRoot, 'plans', 'todos.json'))).toBe(true)
  })

  it('returns default plan mode state and view for blank conversation ids', () => {
    expect(getPlanModeStateForConversation(undefined)).toMatchObject({
      status: 'tool_execute',
      planSlug: null,
    })
    expect(getPlanModeView('   ')).toBeDefined()
    expect(isPlanModeActive(undefined)).toBe(false)
    expect(isPlanExecutionActive('')).toBe(false)
    expect(consumePendingPlanActivation(undefined)).toBe(false)
    expect(consumePendingPlanExecution('')).toBe(false)
    expect(hasPendingPlanActivation(undefined)).toBe(false)
    expect(hasPendingPlanExecution('')).toBe(false)
  })

  it('clears plan mode and removes stored artifacts', () => {
    bootstrapPlanModeStorage('conv-clear', 'clear-me', { sandboxRoot })
    const view = clearPlanMode('conv-clear')
    expect(view.status).toBe('tool_execute')
    expect(planState.planSlug).toBeNull()
  })
})
