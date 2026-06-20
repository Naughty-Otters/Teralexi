import { describe, expect, it, vi, beforeEach } from 'vitest'
import { assembleInstructions } from './pipeline'

vi.mock('../coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
  isPlanExecutionActive: vi.fn(() => false),
  planModeStorageOptionsFromEnv: vi.fn(() => ({})),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn((path: string) =>
      String(path).includes('manifest.json'),
    ),
  }
})

vi.mock('../coding/plan-mode-storage-impl', () => ({
  resolvePlanModeStorage: vi.fn(() => ({
    manifestFile: {
      absolutePath: '/tmp/sandbox/plans/manifest.json',
      displayPath: 'plans/manifest.json',
    },
  })),
}))

vi.mock('../coding/explore-manifest', () => ({
  readExploreManifest: vi.fn(() => ({
    version: 1,
    updatedAt: '2026-06-06T10:00:00.000Z',
    conversationId: 'conv-1',
    planSlug: 'plan',
    files: [{ path: 'src/a.ts', snippet: 'export const x = 1' }],
  })),
  formatExploreManifestForInstructions: vi.fn(
    () => '## Explore manifest\n- `src/a.ts`',
  ),
}))

vi.mock('@main/cache/app-cache', () => ({
  appCache: {
    getAgents: vi.fn(),
    getPersona: vi.fn(() => null),
    setPersona: vi.fn(),
  },
}))

import { appCache } from '@main/cache/app-cache'

function makeToolLoopCtx(overrides: Record<string, unknown> = {}) {
  return {
    opts: {
      skillId: 'demo',
      userId: 'user-1',
      responseLanguage: 'English',
      ...((overrides.opts as object) ?? {}),
    },
    executionSteps: {
      skills: 'Skill body from skill.md',
      ...((overrides.executionSteps as object) ?? {}),
    },
    runtimeTools: [
      { name: 'read_file', source: 'skill' as const, description: 'Read' },
    ],
    sandbox: {
      buildSandboxStructureBlock: () => '=== SANDBOX ===\n/root\n=== END SANDBOX ===',
      buildWorkspaceStructureBlock: () => '=== USER WORKSPACE (not set) ===',
      buildInstructionBlock: () => 'combined',
      getRoot: () => '',
    },
    getLatestUserMessageContent: () => '',
    config: {
      withResponseLanguageInstruction: (text: string, lang?: string) =>
        lang ? `${text}\n\nRespond in ${lang}.` : text,
    },
    renderPreviousStepContextBlock: () => '',
    agentFlow: {
      toolReadCache: {
        listReadPaths: () => [],
      },
    },
    ...overrides,
  }
}

describe('injector pipeline', () => {
  beforeEach(() => {
    vi.mocked(appCache.getAgents).mockReturnValue(null)
  })

  it('assembles tool-loop instructions with skills and sandbox blocks', () => {
    const out = assembleInstructions(makeToolLoopCtx() as never, 'toolLoop')
    expect(out).not.toContain('expert tool manager')
    expect(out).toContain('### Skill instructions')
    expect(out).toContain('Skill body from skill.md')
    expect(out).toContain('=== SANDBOX ===')
    expect(out).toContain('=== USER WORKSPACE')
    expect(out).toContain('Respond in English')
  })

  it('omits base tool-loop block when skills text is empty', () => {
    const out = assembleInstructions(
      makeToolLoopCtx({ executionSteps: { skills: '' } }) as never,
      'toolLoop',
    )
    expect(out).toContain('expert tool manager')
    expect(out).not.toContain('### Skill instructions')
  })

  it('includes validation rules when set on executionSteps', () => {
    const out = assembleInstructions(
      makeToolLoopCtx({
        executionSteps: {
          skills: 'Skill body',
          validation: ['use run_script for host metrics'],
        },
      }) as never,
      'toolLoop',
    )
    expect(out).toContain('### Validation rules')
    expect(out).toContain('use run_script for host metrics')
  })

  it('includes run_script guidance for default skill when tools are available', () => {
    const out = assembleInstructions(
      makeToolLoopCtx({
        opts: { skillId: 'default' },
        runtimeTools: [
          { name: 'run_script', source: 'skill' as const, description: 'Run' },
          { name: 'run_script_file', source: 'skill' as const, description: 'Run file' },
        ],
      }) as never,
      'toolLoop',
    )
    expect(out).toContain('Prefer sandbox script tools')
    expect(out).toContain('uptime')
  })

  it('assembles todo execution instructions', () => {
    const out = assembleInstructions(
      makeToolLoopCtx({ opts: { skillId: 'coding', conversationId: 'conv-1' } }) as never,
      'todoExecution',
      {
        todo: {
          stepGoal: 'Fetch the report',
          attempt: 1,
          maxAttempts: 3,
          lastRetryContext: '',
          previousStepBlock: '',
        },
      },
    )
    expect(out).toContain('expert executor')
    expect(out).toContain('Fetch the report')
    expect(out).toContain('Attempt: 1/3')
    expect(out).toContain('Explore manifest')
    expect(out).toContain('Tool Result Decision Rules')
  })

})
