import { describe, expect, it } from 'vitest'
import {
  toolOutputIndicatesTodosAllDone,
  updateTodosAllDoneSpinStopWhen,
} from './update-todos-stop'
import { UPDATE_TODOS_ALL_DONE_MESSAGE } from '@shared/agent/todos'

describe('update-todos-stop', () => {
  it('detects allDone from summary and message only', () => {
    expect(
      toolOutputIndicatesTodosAllDone({
        ok: true,
        summary: { allDone: true },
      }),
    ).toBe(true)
    expect(
      toolOutputIndicatesTodosAllDone({
        message: UPDATE_TODOS_ALL_DONE_MESSAGE,
      }),
    ).toBe(true)
    // Dedupe stubs for pending-list sync must NOT look like allDone
    expect(
      toolOutputIndicatesTodosAllDone({
        alreadySucceeded: true,
        tool: 'update_todos',
      }),
    ).toBe(false)
    expect(
      toolOutputIndicatesTodosAllDone({
        ok: true,
        summary: { allDone: false },
      }),
    ).toBe(false)
  })

  it('does not stop after a single allDone update_todos step', () => {
    const stop = updateTodosAllDoneSpinStopWhen()
    expect(
      stop({
        steps: [
          {
            toolCalls: [{ toolName: 'update_todos' }],
            toolResults: [
              {
                toolName: 'update_todos',
                output: { ok: true, summary: { allDone: true } },
              },
            ],
          },
        ],
      } as never),
    ).toBe(false)
  })

  it('stops after two consecutive allDone update_todos-only steps', () => {
    const stop = updateTodosAllDoneSpinStopWhen()
    const allDoneStep = {
      toolCalls: [{ toolName: 'update_todos' }],
      toolResults: [
        {
          toolName: 'update_todos',
          output: { ok: true, summary: { allDone: true } },
        },
      ],
    }
    expect(stop({ steps: [allDoneStep, allDoneStep] } as never)).toBe(true)
  })

  it('does not stop when other tools ran between updates', () => {
    const stop = updateTodosAllDoneSpinStopWhen()
    expect(
      stop({
        steps: [
          {
            toolCalls: [{ toolName: 'update_todos' }],
            toolResults: [
              {
                toolName: 'update_todos',
                output: { ok: true, summary: { allDone: true } },
              },
            ],
          },
          {
            toolCalls: [{ toolName: 'read_file' }],
            toolResults: [{ toolName: 'read_file', output: { content: 'x' } }],
          },
        ],
      } as never),
    ).toBe(false)
  })
})
