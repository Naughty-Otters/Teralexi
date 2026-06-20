import { describe, expect, it } from 'vitest'
import {
  formatScopedStageId,
  formatScopedStepInstanceKey,
  formatScopedStepKey,
  parseScopedId,
  randomShortId,
  createSubAgentRunId,
  SHORT_RUN_ID_LENGTH,
  stableRootRunId,
  stageIdForPipelineLookup,
  toolLoopFilesystemScopeFromStepKey,
} from './flow-scoped-ids'

describe('flow-scoped-ids', () => {
  it('round-trips scoped stage ids', () => {
    const scoped = formatScopedStageId('run-a', 'foreachItem')
    expect(scoped).toBe('run-a::foreachItem')
    expect(parseScopedId(scoped)).toEqual({ flowId: 'run-a', local: 'foreachItem' })
  })

  it('leaves legacy unscoped stage ids as local-only', () => {
    expect(parseScopedId('foreachItem')).toEqual({ local: 'foreachItem' })
    expect(stageIdForPipelineLookup('foreachItem', 'run-a')).toBe('foreachItem')
  })

  it('rejects scoped stage for a different flow', () => {
    expect(
      stageIdForPipelineLookup('run-b::foreachItem', 'run-a'),
    ).toBeUndefined()
  })

  it('randomShortId returns 8 hex characters by default', () => {
    const id = randomShortId()
    expect(id).toHaveLength(SHORT_RUN_ID_LENGTH)
    expect(id).toMatch(/^[0-9a-f]{8}$/)
  })

  it('createSubAgentRunId prefixes agent slug and unique suffix', () => {
    const id = createSubAgentRunId('skill:coding')
    expect(id).toMatch(/^sub-agent-coding-[0-9a-f]{8}$/)
  })

  it('builds stable root run ids from conversation and assistant message', () => {
    expect(
      stableRootRunId({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-9',
        messages: [],
      }),
    ).toBe('conv-1:msg-9')
    expect(formatScopedStageId('conv-1:msg-9', 'foreachItem')).toBe(
      'conv-1:msg-9::foreachItem',
    )
  })

  it('maps scoped step keys to filesystem tool-loop paths', () => {
    expect(
      toolLoopFilesystemScopeFromStepKey('conv:msg::toolLoop:abc12345'),
    ).toBe('toolLoop/abc12345')
    expect(
      toolLoopFilesystemScopeFromStepKey(
        '717764d4-5ff5-4af6-95c7-350787f87b74:7509b37d-ad9c-4079-be06-22ae19bde6a9::toolLoop:7488d744',
      ),
    ).toBe('toolLoop/7488d744')
  })

  it('formats scoped step instance keys', () => {
    const key = formatScopedStepInstanceKey('run-a', 'toolLoop', 'abc')
    expect(key).toBe('run-a::toolLoop:abc')
    expect(parseScopedId(key)).toEqual({
      flowId: 'run-a',
      local: 'toolLoop:abc',
    })
  })

  it('scopes arbitrary local step keys', () => {
    expect(formatScopedStepKey('run-a', 'toolLoop:3')).toBe('run-a::toolLoop:3')
  })
})
