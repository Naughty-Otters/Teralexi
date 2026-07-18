/**
 * Documents the expected IPC error contract for high-risk surfaces.
 *
 * Result-style handlers must return `{ ok: false, error }` (or equivalent) and
 * must not throw for expected user/input failures. Throw-style handlers reject
 * the invoke promise — every renderer caller must catch.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Channels that use an explicit Result / `{ ok }` payload for failures. */
export const RESULT_STYLE_IPC_CHANNELS = [
  'GetWorkspaceGitStatus',
  'GetWorkspaceGitDiff',
  'GetWorkspaceGitLog',
  'WorkspaceGitCommit',
  'ReadWorkspaceFile',
  'WriteWorkspaceFile',
  'GetSkillComposerToolbarPlugins',
  'PreviewSkillComposerToolbarPlugin',
  'InvokeSkillComposerToolbarPlugin',
  'PickChatAttachments',
] as const

/**
 * Channels that reject on failure (throw / Promise.reject).
 * Callers must wrap invoke in try/catch — do not assume a Result object.
 */
export const THROW_STYLE_IPC_CHANNELS = [
  'GoogleSignIn',
  'CreateWorkflowDraft',
  'UpsertAgentConfiguration',
  'DeleteAgentConfiguration',
] as const

describe('IPC error contract inventory', () => {
  const channelSource = readFileSync(
    resolve(__dirname, '../../ipc/channel.ts'),
    'utf8',
  )

  it('lists Result-style channels that exist in channel.ts', () => {
    for (const name of RESULT_STYLE_IPC_CHANNELS) {
      expect(channelSource).toContain(`${name}:`)
    }
  })

  it('lists throw-style channels that exist in channel.ts', () => {
    for (const name of THROW_STYLE_IPC_CHANNELS) {
      expect(channelSource).toContain(`${name}:`)
    }
  })

  it('keeps Result-style and throw-style inventories disjoint', () => {
    const overlap = RESULT_STYLE_IPC_CHANNELS.filter((name) =>
      (THROW_STYLE_IPC_CHANNELS as readonly string[]).includes(name),
    )
    expect(overlap).toEqual([])
  })

  it('documents Result-style workspace/toolbar channels with ok in their type', () => {
    for (const name of [
      'GetWorkspaceGitStatus',
      'GetSkillComposerToolbarPlugins',
      'InvokeSkillComposerToolbarPlugin',
      'PickChatAttachments',
    ] as const) {
      const idx = channelSource.indexOf(`${name}:`)
      expect(idx).toBeGreaterThan(-1)
      const slice = channelSource.slice(idx, idx + 800)
      expect(slice).toMatch(/ok:\s*boolean/)
    }
  })
})
