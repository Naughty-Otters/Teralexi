import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { stepCountIs } from '@openfde-ai'
import { resolveToolLoopMaxIterations } from '@shared/agent/tool-loop'
import { expressionPlanIsRunnable } from './expression-plan'
import {
  buildSkillsInstructionsBlock,
  resolveToolLoopStopWhen,
  toolLoopStageShouldRun,
} from './tool-loop-expr'
import { toolLoopFlowStepDefinition } from '../flow/tool-loop-flow-step'
import { bootstrapPlanModeStorage } from '../coding/plan-mode-state'
import { writePlanModeTodoList } from '../coding/plan-mode-storage-impl'
import { replaceTodos } from '@shared/agent/todos'

const { planState } = vi.hoisted(() => ({
  planState: { status: 'tool_execute' as const, planSlug: null as string | null },
}))

vi.mock('@main/agent/sandbox/run-context', () => ({
  getAgentRunSandboxRoot: vi.fn(() => null as string | null),
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getConversationPlanModeState: vi.fn(() => ({ ...planState })),
    setConversationPlanModeState: vi.fn(
      (_id: string, next: typeof planState) => {
        Object.assign(planState, next)
      },
    ),
  })),
}))

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    opts: { skillId: 'skill-1', ...overrides },
    runtimeTools: [{ name: 'read_file', source: 'skill' }],
    ...overrides,
  }
}

describe('tool-loop-expr', () => {
  it('toolLoopStageShouldRun when skill or MCP tools available', () => {
    expect(toolLoopStageShouldRun(makeCtx() as never)).toBe(true)
    expect(
      toolLoopStageShouldRun(
        makeCtx({
          opts: { skillId: undefined },
          runtimeTools: [{ source: 'mcp', name: 'mcp_tool' }],
        }) as never,
      ),
    ).toBe(true)
  })

  it('toolLoopStageShouldRun is false without tools', () => {
    expect(
      toolLoopStageShouldRun(
        makeCtx({ runtimeTools: [], opts: { skillId: 's' } }) as never,
      ),
    ).toBe(false)
  })

  it('toolLoopStageShouldRun is false when all plan todos are complete on disk', () => {
    const sandboxRoot = mkdtempSync(join(tmpdir(), 'tool-loop-gate-'))
    try {
      bootstrapPlanModeStorage('conv-plan-done', 'plan', { sandboxRoot })
      writePlanModeTodoList(
        'conv-plan-done',
        replaceTodos([{ content: 'Done task', status: 'completed' }]),
        { sandboxRoot },
      )
      expect(
        toolLoopStageShouldRun(
          makeCtx({
            opts: { conversationId: 'conv-plan-done', skillId: 'skill-1' },
            sandbox: { getRoot: () => sandboxRoot },
          }) as never,
        ),
      ).toBe(false)
    } finally {
      rmSync(sandboxRoot, { recursive: true, force: true })
    }
  })

  it('toolLoopStageShouldRun is false when thinking routes to direct_answer', () => {
    expect(
      toolLoopStageShouldRun(
        makeCtx({
          stepOutputs: {
            thinking: {
              raw: 'x',
              execution_mode: 'direct_answer',
              goal: 'g',
              response: 'Hello',
            },
          },
        }) as never,
      ),
    ).toBe(false)
  })

  it('flow step shouldRun matches stage helper', () => {
    const flow = {
      opts: { skillId: 'skill-1' },
      runtimeTools: [{ name: 't', source: 'skill' }],
    }
    expect(
      toolLoopFlowStepDefinition.shouldRun?.({ flow: flow as never, config: {} }),
    ).toBe(true)
  })

  it('expressionPlan is runnable when it has tool or prompt', () => {
    expect(expressionPlanIsRunnable({ userPrompt: 'custom', tool: 'read_file' })).toBe(true)
    expect(expressionPlanIsRunnable({})).toBe(false)
    expect(expressionPlanIsRunnable(undefined)).toBe(false)
  })

  it('buildSkillsInstructionsBlock includes executionSteps.skills', () => {
    const block = buildSkillsInstructionsBlock({
      executionSteps: { skills: 'From skill.md body' },
    } as never)
    expect(block).toContain('### Skill instructions')
    expect(block).toContain('From skill.md body')
    expect(buildSkillsInstructionsBlock({ executionSteps: {} } as never)).toBe('')
  })

  it('resolveToolLoopStopWhen only bounds by iteration count (no run_script halt)', () => {
    const ctx = {
      opts: { toolLoopMaxIterations: 42 },
      executionSteps: { toolLoop: { maxIterations: 30 } },
    } as never
    const stopWhen = resolveToolLoopStopWhen(ctx)
    expect(stopWhen).toHaveLength(1)
    const expectedMax = resolveToolLoopMaxIterations(30)
    const atLimit = { steps: Array.from({ length: expectedMax }, () => ({})) }
    const belowLimit = { steps: Array.from({ length: expectedMax - 1 }, () => ({})) }
    expect(stopWhen[0](atLimit)).toBe(true)
    expect(stopWhen[0](belowLimit)).toBe(false)
    expect(stepCountIs(expectedMax)(atLimit)).toBe(true)
  })
})
