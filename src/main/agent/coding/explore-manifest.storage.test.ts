import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOL_LOOP_STEP_ID } from '../constants/step-ids'

const listToolResultsMock = vi.hoisted(() => vi.fn())
const getWorkspacePathMock = vi.hoisted(() => vi.fn())
const resolvePlanModeStorageMock = vi.hoisted(() => vi.fn())

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({ listToolResults: listToolResultsMock }),
}))

vi.mock('../workspace/conversation-workspace', () => ({
  getWorkspacePath: getWorkspacePathMock,
}))

vi.mock('./plan-mode-storage-impl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./plan-mode-storage-impl')>()
  return {
    ...actual,
    resolvePlanModeStorage: resolvePlanModeStorageMock,
    ensurePlanModePlansDir: vi.fn((dir: string) => {
      const fs = require('node:fs') as typeof import('node:fs')
      fs.mkdirSync(dir, { recursive: true })
    }),
  }
})

import {
  buildAndPersistExploreManifest,
  clearExploreManifest,
  readExploreManifest,
  writeExploreManifest,
  type ExploreFileManifest,
} from './explore-manifest'

describe('explore-manifest storage operations', () => {
  let sandboxRoot: string
  let plansDirAbs: string
  let manifestPath: string

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-explore-manifest-'))
    plansDirAbs = join(sandboxRoot, 'plans')
    manifestPath = join(plansDirAbs, 'manifest.json')
    getWorkspacePathMock.mockReturnValue(join(sandboxRoot, 'workspace'))

    resolvePlanModeStorageMock.mockReturnValue({
      sandboxRoot,
      plansDirAbs,
      planFile: {
        absolutePath: join(plansDirAbs, 'plan.md'),
        displayPath: 'plans/plan.md',
        slug: 'plan',
      },
      todosFile: {
        absolutePath: join(plansDirAbs, 'todos.json'),
        displayPath: 'plans/todos.json',
      },
      manifestFile: {
        absolutePath: manifestPath,
        displayPath: 'plans/manifest.json',
      },
    })

    listToolResultsMock.mockReset()
  })

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true })
    resolvePlanModeStorageMock.mockReset()
    getWorkspacePathMock.mockReset()
  })

  it('writes then reads manifest from plan-mode storage', () => {
    const manifest: ExploreFileManifest = {
      version: 1,
      updatedAt: '2026-06-06T00:00:00.000Z',
      conversationId: 'conv-1',
      planSlug: 'plan',
      files: [{ path: 'src/a.ts', snippet: 'export const a = 1' }],
    }

    expect(writeExploreManifest('conv-1', manifest)).toBe(true)
    const readBack = readExploreManifest('conv-1')
    expect(readBack?.planSlug).toBe('plan')
    expect(readBack?.files[0]?.path).toBe('src/a.ts')
  })

  it('clearExploreManifest removes persisted manifest file', () => {
    const manifest: ExploreFileManifest = {
      version: 1,
      updatedAt: '2026-06-06T00:00:00.000Z',
      conversationId: 'conv-1',
      planSlug: 'plan',
      files: [],
    }

    expect(writeExploreManifest('conv-1', manifest)).toBe(true)
    expect(readExploreManifest('conv-1')).not.toBeNull()

    clearExploreManifest('conv-1')
    expect(readExploreManifest('conv-1')).toBeNull()
  })

  it('buildAndPersistExploreManifest returns null for blank identifiers', () => {
    expect(buildAndPersistExploreManifest('  ', 'plan')).toBeNull()
    expect(buildAndPersistExploreManifest('conv-1', '   ')).toBeNull()
  })

  it('builds from stored tool results and persists manifest', () => {
    listToolResultsMock.mockReturnValue([
      {
        id: '1',
        conversationId: 'conv-1',
        agentId: 'a1',
        stepId: TOOL_LOOP_STEP_ID,
        toolName: 'read_file',
        inputSummary: 'path=src/a.ts',
        outputText: JSON.stringify({
          path: 'src/a.ts',
          content: 'export const a = 1',
        }),
        outputSummary: '',
        outputChars: 20,
        isError: false,
        createdAt: '2026-06-06T10:00:00.000Z',
        threadTag: 'general',
      },
    ])

    const manifest = buildAndPersistExploreManifest('conv-1', 'plan')
    expect(manifest).not.toBeNull()
    expect(manifest?.files.length).toBe(1)
    expect(readExploreManifest('conv-1')?.files.length).toBe(1)
  })
})
