import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { AgentFlowContext } from './context'
import { TOOL_LOOP_STEP_ID, TOOL_LOOP_STEP_TITLE } from './constants/step-ids'
import { SandboxContext } from './sandbox/context'

function makeFlowWithSandbox(root: string): AgentFlowContext {
  const flow = new AgentFlowContext({
    provider: 'ollama',
    model: 'test',
    systemPrompt: '',
    messages: [{ role: 'user', content: 'run tools' }],
    conversationId: 'conv-1',
    assistantMessageId: 'msg-1',
  })
  flow.sandbox = {
    getRoot: () => root,
    toolLoopOutputRelBase: (scope: string) => join('output', 'toolLoop', scope),
  } as unknown as SandboxContext
  return flow
}

describe('mergeToolLoopAttachmentsIntoParent', () => {
  it('merges standalone child tool-loop files onto the visible parent step', () => {
    const root = mkdtempSync(join(tmpdir(), 'openfde-toolloop-att-'))
    const childScope = 'toolLoop:child-run'
    const childResults = join(root, 'output', 'toolLoop', 'child-run', 'results')
    mkdirSync(childResults, { recursive: true })
    writeFileSync(join(childResults, 'report.html'), '<html></html>', 'utf8')

    const flow = makeFlowWithSandbox(root)
    const parent = flow.beginStep(TOOL_LOOP_STEP_ID, TOOL_LOOP_STEP_TITLE)
    const child = flow.beginStep(TOOL_LOOP_STEP_ID, TOOL_LOOP_STEP_TITLE, {
      suppressToolLoopUi: true,
      toolLoopOutputRelDir: join('output', 'toolLoop', 'child-run'),
    })
    flow.appendStepAttachments(child.key, [
      {
        path: join(childResults, 'report.html'),
        label: 'report.html',
      },
    ])

    const onStepProgress = vi.fn()
    flow.opts.onStepProgress = onStepProgress

    flow.mergeToolLoopAttachmentsIntoParent(parent.key)

    const parentAttachments = flow.getStepAttachments(parent.key)
    expect(parentAttachments.map((a) => a.label)).toContain('report.html')
    expect(onStepProgress).toHaveBeenCalled()
    const payload = onStepProgress.mock.calls.at(-1)?.[0] as {
      attachments?: Array<{ label: string }>
    }
    expect(payload.attachments?.map((a) => a.label)).toContain('report.html')
  })
})

describe('emitStepProgress publish routing', () => {
  it('forwards per-task tool loop progress to the batch parent for live UI', () => {
    const flow = makeFlowWithSandbox(mkdtempSync(join(tmpdir(), 'openfde-toolloop-ui-')))
    const onStepProgress = vi.fn()
    flow.opts.onStepProgress = onStepProgress

    const parent = flow.beginStep(TOOL_LOOP_STEP_ID, TOOL_LOOP_STEP_TITLE)
    const child = flow.beginStep(TOOL_LOOP_STEP_ID, 'Fix login bug', {
      todoId: 1,
    })

    onStepProgress.mockClear()

    flow.emitStepProgress(
      '\n\n⚠ **LLM error** (toolLoop): LLM request failed (network): timeout\n\n',
      TOOL_LOOP_STEP_ID,
      child.key,
    )

    expect(onStepProgress).toHaveBeenCalledTimes(1)
    const payload = onStepProgress.mock.calls[0]?.[0] as {
      stepKey?: string
      content?: string
    }
    expect(payload.stepKey).toBe(parent.key)
    expect(payload.content).toContain('LLM error')
  })
})
