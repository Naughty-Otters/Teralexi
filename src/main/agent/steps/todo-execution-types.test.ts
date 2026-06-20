import { describe, expect, it, vi } from 'vitest'
import { verifyTodoResult } from './todo-execution-types'

const verifierModel = { stage: 'verifier-model' }

function makeCtx(streamObjectToStepProgress: ReturnType<typeof vi.fn>) {
  return {
    providers: { streamObjectToStepProgress },
    config: {
      withResponseLanguageInstruction: (s: string) => s,
    },
    opts: {
      responseLanguage: 'en',
      abortSignal: undefined,
    },
    resolveStageModel: vi.fn(() => verifierModel),
  }
}

describe('verifyTodoResult', () => {
  it('adds form-submit verifier context when route is form-submit', async () => {
    const streamObjectToStepProgress = vi.fn(async () => ({
      output: { valid: true, summary: 'ok' },
    }))

    await verifyTodoResult(makeCtx(streamObjectToStepProgress) as never, {
      todoName: 'Run unknown command flow',
      todoDescription: 'Submit form then execute command',
      successCriteria: 'Command runs with provided fields',
      output: 'stdout: command completed',
      route: 'form-submit',
    })

    expect(streamObjectToStepProgress).toHaveBeenCalledTimes(1)
    const callArgs = streamObjectToStepProgress.mock.calls[0]?.[1] as {
      messages?: Array<{ content?: string }>
      model?: unknown
    }
    const userContent = callArgs.messages?.[0]?.content ?? ''
    expect(userContent).toContain(
      'User has already submitted the required form values',
    )
    expect(userContent).toContain(
      'Do not require an additional wait/pause for user input',
    )
    expect(userContent).toContain('Step goal (verify against this only):')
    expect(callArgs.model).toBe(verifierModel)
  })

  it('does not add form-submit context for normal route', async () => {
    const streamObjectToStepProgress = vi.fn(async () => ({
      output: { valid: true, summary: 'ok' },
    }))

    await verifyTodoResult(makeCtx(streamObjectToStepProgress) as never, {
      todoName: 'Run command',
      todoDescription: 'Execute shell command',
      successCriteria: 'Command succeeds',
      output: 'stdout: ok',
      route: 'normal',
    })

    const callArgs = streamObjectToStepProgress.mock.calls[0]?.[1] as {
      messages?: Array<{ content?: string }>
    }
    const userContent = callArgs.messages?.[0]?.content ?? ''
    expect(userContent).not.toContain('Form submit context:')
  })
})
