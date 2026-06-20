import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach } from 'vitest'
import { AgentFlowContext } from '../context'
import { TOOL_LOOP_STEP_ID } from '../constants/step-ids'
import { buildExecutionOutputForVerification } from './build-execution-output-for-verification'

describe('buildExecutionOutputForVerification', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  it('includes output file previews when assistant text is empty', async () => {
    dir = join(tmpdir(), `verify-out-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, 'output', 'data.txt')
    await mkdir(join(dir, 'output'), { recursive: true })
    await writeFile(filePath, 'metric=42\nstatus=ok', 'utf8')

    const flow = new AgentFlowContext({
      messages: [],
      opts: {} as never,
      config: {} as never,
    })

    const stepKey = 'toolLoop:todo-1'
    flow.stepHistory.push({
      key: stepKey,
      stepId: TOOL_LOOP_STEP_ID,
      title: 'Run',
      sequence: 1,
      completedAt: Date.now(),
      meta: { todoId: 7 },
    } as never)

    flow.appendStepAttachments(stepKey, [
      { path: filePath, label: 'data.txt' },
    ])

    const text = await buildExecutionOutputForVerification({
      flow,
      todoId: 7,
      assistantText: '',
    })

    expect(text).toContain('Output file')
    expect(text).toContain('metric=42')
  })
})
