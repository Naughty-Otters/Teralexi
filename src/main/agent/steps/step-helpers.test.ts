import { describe, expect, it, vi, beforeEach } from 'vitest'

// Avoid Electron/SQLite/config I/O that can hang under CI timeouts.
vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getUserProperty: () => null,
  }),
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValue: (_key: string, fallback: string) => fallback,
  getSystemPropValues: () => ({}),
}))

vi.mock('../utils/chat-context-settings', () => ({
  loadChatUiReasoningMaxChars: () => 12_000,
  loadChatContextWindowMessages: () => 40,
}))

vi.mock('../llm/llm-debug-writer', () => ({
  scheduleLlmDebugRequest: vi.fn(() => null),
  scheduleLlmDebugResponse: vi.fn(),
}))

vi.mock('../tool-approval-secret', () => ({
  getToolApprovalSecret: () => 'test-tool-approval-secret-32chars!!',
}))

vi.mock('../llm/runtime', () => ({
  runAgentStream: vi.fn(),
}))

import {
  applyPerStreamToolInputDedupe,
  createToolInputDedupeState,
  buildTodoStepGoalForExecution,
  buildTodoStepGoalFromPlan,
  collectAgentText,
  filterToolsByAvailableSet,
  formatTodoGoalForFormSubmitResume,
  formatTodoGoalForInstructions,
  streamAgent,
} from './step-helpers'
import { runAgentStream } from '../llm/runtime'
import { STEP_HELPERS_LABELS } from '../constants/pipeline'
import * as agentMemory from '../agent-memory'

const runAgentStreamMock = vi.mocked(runAgentStream)

describe('formatTodoGoalForInstructions', () => {
  it('formats name, description, and success criteria', () => {
    const out = formatTodoGoalForInstructions({
      name: ' Build ',
      description: ' Compile ',
      success_criteria: ' Green CI ',
    })
    expect(out).toContain(`${STEP_HELPERS_LABELS.TASK} Build`)
    expect(out).toContain(`${STEP_HELPERS_LABELS.DESCRIPTION} Compile`)
    expect(out).toContain(`${STEP_HELPERS_LABELS.SUCCESS_CRITERIA} Green CI`)
  })

  it('returns fallback when all fields empty', () => {
    expect(formatTodoGoalForInstructions({})).toBe('(no task details)')
  })

  it('strips planning schema placeholders', () => {
    const out = formatTodoGoalForInstructions({
      name: '<short task name>',
      description: '<detailed description of what to do>',
    })
    expect(out).toBe('(no task details)')
  })

  it('buildTodoStepGoalFromPlan reads canonical planning todoList row', () => {
    const out = buildTodoStepGoalFromPlan(
      {
        finalGoal: 'Quote demo',
        todoList: [
          {
            id: 1,
            name: 'Scrape homepage',
            description: 'Fetch tags from quotes.toscrape.com',
            success_criteria: 'top-tags-today.md exists',
          },
        ],
      },
      { id: 1, name: '', description: '' },
      0,
    )
    expect(out).toContain('Task: Scrape homepage')
    expect(out).toContain('Description: Fetch tags from quotes.toscrape.com')
    expect(out).toContain('Success criteria: top-tags-today.md exists')
  })

  it('includes reference_scripts on the step goal when attached on the todo', () => {
    const out = formatTodoGoalForInstructions({
      name: 'Sort quotes',
      description: 'Run the sort script on raw data',
      success_criteria: 'Sorted file exists',
      reference_scripts: [
        { script_type: 'python', reference_url: 'scripts/sort_script.py' },
      ],
    })
    expect(out).toContain('Reference scripts:')
    expect(out).toContain('[python] scripts/sort_script.py')
  })

  it('infers reference_scripts in step goal from description text', () => {
    const out = formatTodoGoalForInstructions({
      name: 'Sort quotes',
      description: 'Run scripts/sort_script.py on quotes-raw.json',
      success_criteria: 'quotes-sorted.json exists',
    })
    expect(out).toContain('Reference scripts:')
    expect(out).toContain('scripts/sort_script.py')
  })

  it('form-submit resume replaces planning description and success criteria', () => {
    const staleDescription =
      "Since the user only stated 'I want to run a command' without providing a specific command, the system must invoke the run-command form"
    const out = formatTodoGoalForFormSubmitResume(
      {
        name: 'Run command',
        description: staleDescription,
        success_criteria: 'Form collected before tool execution',
      },
      { mode: 'execute' },
    )
    expect(out).toContain('Task: Run command')
    expect(out).not.toContain(staleDescription)
    expect(out).not.toContain('Form collected before tool execution')
    expect(out).toContain('already submitted the required form values')
    expect(out).toContain('re-invoke the collect form')
  })

  it('buildTodoStepGoalForExecution rewrites goal when form values are collected', () => {
    const plan = {
      finalGoal: 'Run a command',
      todoList: [
        {
          id: 1,
          name: 'Run command',
          description: 'Must collect run_command via form first',
          success_criteria: 'Form shown to user',
        },
      ],
    }
    const planning = buildTodoStepGoalForExecution(plan, { id: 1 }, 0, false)
    expect(planning).toContain('Must collect run_command via form first')

    const withValues = buildTodoStepGoalForExecution(plan, { id: 1 }, 0, true)
    expect(withValues).not.toContain('Must collect run_command via form first')
    expect(withValues).toContain('already submitted the required form values')
  })

  it('falls back to finalGoal and plan step when todos are placeholders', () => {
    const out = formatTodoGoalForInstructions(
      {
        name: '<short task name>',
        description: '<detailed description of what to do>',
      },
      { finalGoal: 'Deliver quote report', todoId: 2 },
    )
    expect(out).toContain('Overall goal: Deliver quote report')
    expect(out).toContain('Plan step: 2')
  })
})

describe('filterToolsByAvailableSet', () => {
  it('returns all tools when availableSet omitted', () => {
    const tools = [
      { name: 'a', source: 'skill' as const },
      { name: 'b', source: 'mcp' as const },
    ]
    expect(filterToolsByAvailableSet(tools)).toHaveLength(2)
  })

  it('filters skill tools but keeps mcp tools', () => {
    const tools = [
      { name: 'a', source: 'skill' as const },
      { name: 'b', source: 'skill' as const },
      { name: 'mcp_tool', source: 'mcp' as const },
    ]
    expect(filterToolsByAvailableSet(tools, ['a'])).toEqual([
      tools[0],
      tools[2],
    ])
  })

  it('always keeps mandatory tools in the runtime tool map', () => {
    const mandatory = { name: 'enter_plan_mode', source: 'skill' as const }
    const optional = { name: 'grep_files', source: 'skill' as const }
    expect(filterToolsByAvailableSet([mandatory, optional], ['read_file'])).toEqual(
      [mandatory],
    )
  })
})

describe('collectAgentText', () => {
  beforeEach(() => {
    runAgentStreamMock.mockReset()
  })

  it('delegates stream collection to runAgentStream', async () => {
    const onChunk = vi.fn()
    const streamResult = {
      textStream: (async function* () {
        yield 'hello'
      })(),
      response: Promise.resolve({ text: 'hello world' }),
    }
    runAgentStreamMock.mockResolvedValue({
      text: 'hello world',
      awaitingToolApproval: false,
      toolCalls: [],
    })

    const result = await collectAgentText(streamResult, onChunk)

    expect(runAgentStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: streamResult,
        onChunk,
      }),
    )
    expect(result.text).toBe('hello world')
    expect(result.awaitingToolApproval).toBe(false)
  })

  it('forwards UI chunks and pending-approval result from runAgentStream', async () => {
    const onChunk = vi.fn()
    const onUIMessageChunk = vi.fn()
    runAgentStreamMock.mockResolvedValue({
      text: 'partial done',
      awaitingToolApproval: true,
      toolCalls: [],
    })

    const result = await collectAgentText(
      {
        textStream: (async function* () {})(),
        response: Promise.resolve(),
      },
      onChunk,
      onUIMessageChunk,
    )

    expect(runAgentStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ onUIMessageChunk }),
    )
    expect(result.awaitingToolApproval).toBe(true)
    expect(result.text).toContain('partial')
  })

  it('records token usage when usage metadata is provided', async () => {
    const readAgentTotalUsage = vi.fn(async () => ({
      inputTokens: 3,
      outputTokens: 4,
    }))
    const recordTokenUsageFromOpts = vi.fn()
    const streamResult = {
      textStream: (async function* () {
        yield 'usage'
      })(),
      response: Promise.resolve({ text: 'usage' }),
    }
    runAgentStreamMock.mockResolvedValue({
      text: 'usage',
      awaitingToolApproval: false,
      toolCalls: [],
    })

    await collectAgentText(streamResult, vi.fn(), undefined, {
      source: 'toolLoop',
      stepId: 'toolLoop',
      opts: {} as never,
      providers: { readAgentTotalUsage, recordTokenUsageFromOpts } as never,
    })

    expect(runAgentStreamMock).toHaveBeenCalled()
    expect(readAgentTotalUsage).toHaveBeenCalledWith(streamResult)
    expect(recordTokenUsageFromOpts).toHaveBeenCalled()
  })
})

describe('applyPerStreamToolInputDedupe', () => {
  it('dedupes identical tool inputs and skips repeat approval', async () => {
    const execute = vi.fn(async () => ({ success: true, data: 1 }))
    const needsApproval = vi.fn(async () => true)
    const toolSet = {
      t1: { execute, needsApproval },
    }
    applyPerStreamToolInputDedupe(toolSet)

    const input = { path: 'a.txt' }
    const [r1, r2] = await Promise.all([
      toolSet.t1.execute(input),
      toolSet.t1.execute(input),
    ])
    expect(r1).toEqual({ success: true, data: 1 })
    expect(r2).toEqual(r1)
    expect(execute).toHaveBeenCalledTimes(1)

    expect(await toolSet.t1.needsApproval(input)).toBe(false)
  })

  it('shares dedupe state across two applyPerStreamToolInputDedupe calls', async () => {
    const execute = vi.fn(async () => ({ content: 'hello' }))
    const shared = createToolInputDedupeState()
    const pathContext = { sandboxRoot: '/proj', workspacePath: '/proj' }

    const toolSetA = { read_file: { execute } }
    applyPerStreamToolInputDedupe(toolSetA, { state: shared, pathContext })

    await toolSetA.read_file.execute({ path: './src/a.ts' })

    const toolSetB = { read_file: { execute } }
    applyPerStreamToolInputDedupe(toolSetB, { state: shared, pathContext })

    await toolSetB.read_file.execute({ path: 'src/a.ts' })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('returns a compact stub on sequential repeat after success', async () => {
    const execute = vi.fn(async () => ({ content: 'large file body' }))
    const toolSet = { read_file: { execute } }
    applyPerStreamToolInputDedupe(toolSet)

    const input = { path: 'x.ts' }
    const first = await toolSet.read_file.execute(input)
    const second = await toolSet.read_file.execute(input)

    expect(first).toEqual({ content: 'large file body' })
    expect(second).toMatchObject({ alreadyRead: true, content: '' })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('dedupes update_todos when result uses ok:true', async () => {
    const execute = vi.fn(async () => ({
      ok: true,
      summary: { allDone: true, total: 1, completed: 1 },
    }))
    const toolSet = { update_todos: { execute } }
    applyPerStreamToolInputDedupe(toolSet)

    const input = { todos: [{ content: 'Done', status: 'completed' }] }
    const first = await toolSet.update_todos.execute(input)
    const second = await toolSet.update_todos.execute(input)

    expect(first).toMatchObject({ ok: true })
    expect(second).toMatchObject({
      alreadySucceeded: true,
      tool: 'update_todos',
    })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('treats read_file content as dedupe success for approval skip', async () => {
    const execute = vi.fn(async () => ({ content: 'file body' }))
    const toolSet = {
      read_file: { execute, needsApproval: true },
    }
    applyPerStreamToolInputDedupe(toolSet)

    const input = { path: 'x.ts' }
    await toolSet.read_file.execute(input)
    expect(await toolSet.read_file.needsApproval(input)).toBe(false)
  })
})

describe('streamAgent', () => {
  const onChunk = vi.fn()

  beforeEach(() => {
    onChunk.mockReset()
    runAgentStreamMock.mockReset()
    runAgentStreamMock.mockResolvedValue({
      text: 'done',
      awaitingToolApproval: false,
      toolCalls: [],
    })
  })

  it('streams the tool loop and returns collected text', async () => {
    const agent = {
      stream: vi.fn(async () => ({
        textStream: (async function* () {
          yield 'done'
        })(),
        response: Promise.resolve({ text: 'done' }),
      })),
    }

    const result = await streamAgent({
      agent: agent as never,
      messages: [{ role: 'user', content: 'go' }],
      toolRunCtx: {
        opts: { abortSignal: undefined, userId: 'user-1' },
        stepInstanceKey: 'step-1',
      } as never,
      onChunk,
    })

    expect(result.text).toBe('done')
    expect(agent.stream).toHaveBeenCalledOnce()
    expect(agent.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'go' }],
        executionContext: expect.objectContaining({ userId: 'user-1' }),
      }),
    )
    expect(runAgentStreamMock).toHaveBeenCalled()
  })

  it('continues when persistAgentStreamTurn fails', async () => {
    vi.spyOn(agentMemory, 'persistAgentStreamTurn').mockRejectedValueOnce(
      new Error('persist failed'),
    )
    runAgentStreamMock.mockResolvedValue({
      text: 'saved',
      awaitingToolApproval: false,
      toolCalls: [],
    })

    const agent = {
      stream: vi.fn(async () => ({
        textStream: (async function* () {
          yield 'saved'
        })(),
        response: Promise.resolve({ text: 'saved' }),
      })),
    }

    const result = await streamAgent({
      agent: agent as never,
      messages: [{ role: 'user', content: 'go' }],
      toolRunCtx: {
        opts: { abortSignal: undefined, userId: 'user-1' },
        stepInstanceKey: 'step-1',
      } as never,
      onChunk,
    })

    expect(result.text).toBe('saved')
  })

  it('emits step progress when Agent.stream fails', async () => {
    const emitStepProgress = vi.fn()
    const agent = {
      stream: vi.fn(async () => {
        throw new Error('503 server error')
      }),
    }

    await expect(
      streamAgent({
        agent: agent as never,
        messages: [{ role: 'user', content: 'go' }],
        toolRunCtx: {
          opts: { abortSignal: undefined, userId: 'user-1' },
          stepInstanceKey: 'step-1',
          emitStepProgress,
        } as never,
        onChunk,
        debugCall: { instructions: 'test', toolNames: [], label: 'agentStream:test' },
      }),
    ).rejects.toThrow('503 server error')

    const msgs = emitStepProgress.mock.calls.map((c) => c[0] as string)
    expect(msgs.some((m) => m.includes('⚠ **LLM error**'))).toBe(true)
    expect(msgs.some((m) => m.includes('agentStream:test'))).toBe(true)
  })
})
