import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  DEEP_THINKING_BEFORE_MARKER,
  MULTIPLE_BRANCH_THINKING_MARKER,
} from './deep-thinking-blocks'

const { testHome, noopInstructionInjector } = vi.hoisted(() => {
  const { join } = require('node:path') as typeof import('node:path')
  return {
    testHome: join(process.cwd(), '.tmp-pipeline-injection-test'),
    noopInstructionInjector: (id: string, order: number) => ({
      id,
      order,
      applies: () => false,
      injectInstructions: () => null,
    }),
  }
})

vi.mock('@config/teralexi-home', () => ({
  getTeralexiHome: () => testHome,
  getTeralexiRulesDir: () => `${testHome}/rules`,
  getTeralexiMemoryDir: () => `${testHome}/memory`,
  getTeralexiAccountsDir: () => `${testHome}/accounts`,
}))

vi.mock('./injector-cache', () => ({
  createMtimeKeyedCache: () => ({
    getOrCompute: (_keyParts: string[], compute: () => string) => compute(),
    clear: () => {},
  }),
  pathMtimeKey: (filePath: string | null | undefined) => filePath?.trim() || 'missing',
}))

vi.mock('./injectors/sub-agents', () => ({
  subAgentsInjector: noopInstructionInjector('sub-agents', 55),
}))

vi.mock('./injectors/memory-persona', () => ({
  memoryPersonaInjector: noopInstructionInjector('memory-persona', 40),
}))

vi.mock('./injectors/project-rules', () => ({
  projectRulesInjector: noopInstructionInjector('project-rules', 45),
}))

vi.mock('./injectors/git-status', () => ({
  gitStatusInjector: noopInstructionInjector('git-status', 80),
  clearGitStatusCacheForTests: () => {},
  MAX_GIT_STATUS_LINES: 40,
}))

vi.mock('./injectors/workspace-open-files', () => ({
  workspaceOpenFilesInjector: noopInstructionInjector('workspace-open-files', 75),
  MAX_OPEN_FILES_LISTED: 30,
}))

vi.mock('./injectors/explore-manifest', () => ({
  exploreManifestInjector: {
    id: 'explore-manifest',
    order: 95,
    applies: ({ profile, ctx }: { profile: { isCodingAgent: boolean; stage: string }; ctx: { opts: { conversationId?: string } } }) =>
      profile.isCodingAgent &&
      (profile.stage === 'toolLoop' || profile.stage === 'todoExecution') &&
      Boolean(ctx.opts.conversationId?.trim()),
    injectInstructions: () => '## Explore manifest\n- `src/a.ts`',
  },
}))

vi.mock('../expr/thread-context-builder', () => ({
  resolveEffectiveThreadTag: () => 'general',
}))

vi.mock('../sandbox/step-output-links', () => ({
  formatExistingSandboxArtifactsBlock: () => '',
}))

vi.mock('../lsp/editor-lsp-bridge', () => ({
  getEditorLspBridge: () => ({
    listOpenDocumentsForWorkspace: () => [],
  }),
  relativePathFromAbs: () => null,
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getMessages: vi.fn(() => []),
    getUserProperty: vi.fn(() => null),
  })),
}))

vi.mock('../memory/agent-memory-store', () => ({
  loadAgentPersonaSnapshot: vi.fn(() => null),
  loadPersonaMemorySnapshot: vi.fn(() => null),
}))

vi.mock('../memory/memory-persona-injection', () => ({
  buildMemoryPersonaInstructionBlock: vi.fn(() => ''),
}))

vi.mock('@shared/agent/project-rules', () => ({
  loadProjectRules: vi.fn(() => []),
  formatProjectRulesBlock: vi.fn(() => ''),
}))

vi.mock('../delegation/skill-routing-catalog', () => ({
  buildSkillRoutingCatalog: vi.fn(() => null),
  formatSkillRoutingBlock: vi.fn(() => ''),
  hasSkillRoutingTargets: vi.fn(() => false),
  hasSubAgentDelegationTool: vi.fn(() => false),
}))

vi.mock('../coding/plan-mode-injection-content', () => ({
  resolvePlanModeInstructionBlock: vi.fn(() => null),
  resolvePlanModeInjectionMessage: vi.fn(() => null),
}))

vi.mock('../coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
  isPlanExecutionActive: vi.fn(() => false),
  planModeStorageOptionsFromEnv: vi.fn(() => ({})),
}))

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

vi.mock('../workspace/conversation-workspace', () => ({
  loadConversationWorkspace: vi.fn(() => null),
}))

vi.mock('@main/cache/app-cache', () => ({
  appCache: {
    getAgents: vi.fn(),
    getPersona: vi.fn(() => null),
    setPersona: vi.fn(),
  },
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValues: vi.fn(() => ({
    'app.google.clientId': '123.apps.googleusercontent.com',
    'app.google.clientSecret': 'secret',
  })),
}))

import { assembleInstructions, injectUserMessages } from './pipeline'
import {
  clearDatetimeInjectionState,
  recordDatetimeInjection,
} from './conversation-injection-state'
import { clearDeepThinkingInjectionState } from './deep-thinking-injection-state'
import { clearOncePerTurnInjectionState } from './once-per-turn-injection-state'
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
    clearDatetimeInjectionState()
    clearDeepThinkingInjectionState()
    clearOncePerTurnInjectionState()
    vi.mocked(appCache.getAgents).mockReturnValue(null)
  })

  it('assembles tool-loop instructions with skills and sandbox blocks', () => {
    const out = assembleInstructions(makeToolLoopCtx() as never, 'toolLoop')
    expect(out).not.toContain('## Current date and time')
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

  it('includes skill system properties when declared on the agent', () => {
    const out = assembleInstructions(
      makeToolLoopCtx({
        opts: {
          systemProperties: [
            {
              key: 'app.google.clientId',
              label: 'Google OAuth client ID',
              type: 'string',
            },
            {
              key: 'app.google.clientSecret',
              label: 'Google OAuth client secret',
              type: 'secret',
            },
          ],
        },
      }) as never,
      'toolLoop',
    )
    expect(out).toContain('### Skill configuration properties')
    expect(out).toContain('`app.google.clientId`')
    expect(out).toContain('123.apps.googleusercontent.com')
    expect(out).toContain('configured (value hidden)')
  })

  it('includes diagram output instructions for tool loop', () => {
    const out = assembleInstructions(makeToolLoopCtx() as never, 'toolLoop')
    expect(out).toContain('## Diagrams (DiagramSpec v1)')
    expect(out).toContain('```diagram')
    expect(out).toContain('"type": "graph"')
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
    expect(out).toContain('```diagram`')
    expect(out).toContain('**Do not** use `run_script`')
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

  it('does not duplicate datetime on later tool-loop steps', async () => {
    const ctx = makeToolLoopCtx({
      opts: { skillId: 'coding', conversationId: 'conv-datetime', userId: 'user-1' },
      agentRun: { meta: { depth: 0 } },
    }) as never
    const first = await injectUserMessages(
      ctx,
      [{ role: 'user', content: 'hi' }],
      0,
    )
    expect(first).toHaveLength(5)
    expect(String(first[1].content)).toContain(DEEP_THINKING_BEFORE_MARKER)
    expect(String(first[2].content)).toContain(MULTIPLE_BRANCH_THINKING_MARKER)
    expect(String(first[3].content)).toContain('## Current date and time')
    expect(String(first[4].content)).toContain('generate_follow_up')

    const second = await injectUserMessages(ctx, first, 1)
    expect(second).toHaveLength(5)
  })

  it('skips injector user messages while tool approvals are still unanswered', async () => {
    const ctx = makeToolLoopCtx({
      opts: { skillId: 'coding', conversationId: 'conv-plan-hitl', userId: 'user-1' },
      agentRun: { meta: { depth: 0 } },
    }) as never

    const pendingApproval: Parameters<typeof injectUserMessages>[1] = [
      { role: 'user', content: 'plan this' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc-enter',
            toolName: 'enter_plan_mode',
            input: {},
          },
          {
            type: 'tool-approval-request',
            approvalId: 'ap-enter',
            toolCallId: 'tc-enter',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'ap-enter',
            approved: true,
          },
        ],
      },
    ]

    const blocked = await injectUserMessages(ctx, pendingApproval, 0)
    expect(blocked).toHaveLength(3)
    expect(blocked.map((m) => m.role)).toEqual(['user', 'assistant', 'tool'])
  })

  it('injects datetime again for a later user turn in the same conversation', async () => {
    const ctx = makeToolLoopCtx({
      opts: {
        skillId: 'coding',
        conversationId: 'conv-follow-up',
        userId: 'user-1',
        clientUiMessages: [
          {
            id: 'user-2',
            role: 'user',
            createdAt: '2026-06-20T10:00:00.000Z',
            parts: [{ type: 'text', text: 'follow up' }],
          },
        ],
      },
      agentRun: { meta: { depth: 0 } },
    }) as never

    recordDatetimeInjection('conv-follow-up', {
      userMessageId: 'user-1',
      userMessageAt: '2026-06-20T08:00:00.000Z',
      dayKey: '2026-06-20',
      injectedAt: '2026-06-20T08:00:01.000Z',
    })

    const messages = await injectUserMessages(
      ctx,
      [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'follow up' },
      ],
      0,
    )

    expect(messages).toHaveLength(7)
    expect(String(messages[3].content)).toContain(DEEP_THINKING_BEFORE_MARKER)
    expect(String(messages[4].content)).toContain(MULTIPLE_BRANCH_THINKING_MARKER)
    expect(String(messages[5].content)).toContain('## Current date and time')
    expect(String(messages[6].content)).toContain('generate_follow_up')
  })
})
