import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentFlowContext, AgentStepContext } from '@main/agent/context'
import type { AgentResponseOpts } from '@main/agent/types'
import { writeFile as writeFileTool } from '@toolSet/file-system'
import { toolLoopFilesystemScopeFromStepKey } from '../run/flow-scoped-ids'
import { runWithExclusiveSandboxGlobals } from '../sandbox/sandbox-globals-lock'
import { AgentStep } from './agent-step'

/** Records `toolLoopOutputScope` passed to each {@link callSkillToolDirect} invocation. */
const toolLoopScopesPassed = vi.hoisted(() => [] as string[])

vi.mock('./step-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./step-helpers')>()
  return {
    ...actual,
    callSkillToolDirect: vi.fn(
      async (
        _skillId: string,
        toolName: string,
        input: unknown,
        runCtx?: AgentStepContext,
      ) => {
        if (runCtx?.stepId === 'toolLoop') {
          toolLoopScopesPassed.push(runCtx.stepInstanceKey)
        }
        const toolLoopScope =
          runCtx?.stepId === 'toolLoop' ? runCtx.stepInstanceKey : undefined
        return runWithExclusiveSandboxGlobals(
          () => {
            runCtx?.syncSandboxForToolExecution(toolLoopScope)
            const outputScope = toolLoopScope
              ? toolLoopFilesystemScopeFromStepKey(toolLoopScope)
              : undefined
            return {
              root: runCtx?.sandbox.getRoot(),
              outputScope,
            }
          },
          async () => {
            if (toolName === 'write_file') {
              return writeFileTool.execute(input as Record<string, unknown>)
            }
            return { ok: true }
          },
        )
      },
    ),
  }
})

class ExposedAgentStep extends AgentStep {
  async execute() {
    /* test harness */
  }

  exposeBuildToolSet(skillId?: string, runCtx?: AgentStepContext) {
    return this.buildToolSet(skillId, runCtx)
  }
}

function makeFlowContext(sandboxRoot: string): AgentFlowContext {
  const writeFileTool = {
    name: 'write_file',
    source: 'skill' as const,
    needsApproval: false,
  }
  const opts = {
    provider: 'ollama',
    model: 'test-model',
    systemPrompt: '',
    messages: [],
    onChunk: () => {},
    userId: 'test-user',
    skillId: 'multi-step-quote-test',
    availableSet: ['write_file'],
    executionSteps: {
      toolLoop: {
        tools: [writeFileTool],
        maxIterations: 40,
      },
    },
  } as AgentResponseOpts
  const flow = new AgentFlowContext(opts, {})
  flow.sandbox.attach({
    layout: {
      root: sandboxRoot,
      skillsDir: join(sandboxRoot, 'skills'),
      refsDir: join(sandboxRoot, 'refs'),
      scriptsDir: join(sandboxRoot, 'scripts'),
      outputDir: join(sandboxRoot, 'output'),
    },
    describe: () => '',
    buildInstructionBlock: () => '',
    buildSandboxStructureBlock: () => '',
    buildWorkspaceStructureBlock: () => '',
    resolveToolLoopOutputLayout: (scope: string) => ({
      root: sandboxRoot,
      outputDir: join(sandboxRoot, 'output'),
      resultsDir: join(sandboxRoot, 'output', 'toolLoop', scope, 'results'),
      scriptsDir: join(sandboxRoot, 'output', 'toolLoop', scope, 'scripts'),
      refsDir: join(sandboxRoot, 'refs'),
      skillsDir: join(sandboxRoot, 'skills'),
      toolLoopScope: scope,
      toolLoopOutputRelDir: join('output', 'toolLoop', scope),
    }),
    ensureToolLoopStepOutputDirs: (scope: string) => {
      const base = join(sandboxRoot, 'output', 'toolLoop', scope)
      return mkdir(join(base, 'results'), { recursive: true }).then(() =>
        mkdir(join(base, 'scripts'), { recursive: true }),
      )
    },
    copyReferenceDoc: async (d) => d,
    copyReferenceScript: async (s) => s,
    copyReferenceDocs: async (docs) => docs,
    copyReferenceScripts: async (scripts) => scripts,
  })
  flow.sandbox.syncBindingToTools()
  return flow
}

function toolLoopPathSegments(stepKey: string): string[] {
  const scoped = toolLoopFilesystemScopeFromStepKey(stepKey)
    .split('/')
    .filter(Boolean)
  return scoped[0] === 'toolLoop' ? scoped.slice(1) : scoped
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

describe('AgentStep.buildToolSet', () => {
  let sandboxRoot: string
  let flow: AgentFlowContext
  let parentCtx: AgentStepContext
  let step: ExposedAgentStep

  beforeEach(async () => {
    toolLoopScopesPassed.length = 0
    sandboxRoot = await mkdtemp(join(tmpdir(), 'teralexi-agent-step-'))
    await mkdir(join(sandboxRoot, 'output', 'toolLoop'), { recursive: true })
    flow = makeFlowContext(sandboxRoot)
    parentCtx = flow.createStepContext('toolLoop', 'Agentic Run')
    step = new ExposedAgentStep(parentCtx)
  })

  afterEach(async () => {
    flow.sandbox.clearBindingFromTools()
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('passes runCtx.stepInstanceKey to callSkillToolDirect, not the parent batch key', async () => {
    const childCtx = parentCtx.createStepContext(
      'toolLoop',
      'Agentic Run Task 2 Attempt 1',
    )
    childCtx.beginStep()

    const toolSet = step.exposeBuildToolSet('multi-step-quote-test', childCtx)
    await toolSet.write_file.execute({
      path: 'output/results/scope-check.txt',
      data: 'child',
      overwrite: true,
    })

    expect(toolLoopScopesPassed.at(-1)).toBe(childCtx.stepInstanceKey)
    expect(toolLoopScopesPassed.at(-1)).not.toBe(parentCtx.stepInstanceKey)
  })

  it('syncSandboxForToolExecution binds sandbox and workspace to file tools', () => {
    const syncBinding = vi.spyOn(flow.sandbox, 'syncBindingToTools')
    const syncWorkspace = vi.spyOn(flow.sandbox, 'syncWorkspaceToTools')
    parentCtx.syncSandboxForToolExecution()
    expect(syncBinding).toHaveBeenCalledTimes(1)
    expect(syncWorkspace).toHaveBeenCalledTimes(1)
    syncBinding.mockRestore()
    syncWorkspace.mockRestore()
  })

  it('defaults to this.ctx.stepInstanceKey when runCtx is omitted (batch parent)', async () => {
    parentCtx.beginStep()

    const toolSet = step.exposeBuildToolSet('multi-step-quote-test')
    await toolSet.write_file.execute({
      path: 'output/results/parent-default.txt',
      data: 'parent',
      overwrite: true,
    })

    expect(toolLoopScopesPassed.at(-1)).toBe(parentCtx.stepInstanceKey)
  })

  describe('multi-todo scenario (SkillsToolExecutionStep pattern)', () => {
    it('each todo runCtx writes only to its own output/toolLoop/<stepInstanceKey>/ folder', async () => {
      const parentKey = parentCtx.stepInstanceKey
      const todoRuns: Array<{ ctx: AgentStepContext; artifactName: string }> =
        []

      for (let todoId = 1; todoId <= 3; todoId++) {
        const toolRunCtx = parentCtx.createStepContext(
          'toolLoop',
          `Agentic Run Task ${todoId} Attempt 1`,
        )
        toolRunCtx.beginStep()
        const artifactName = `todo-${todoId}.txt`
        todoRuns.push({ ctx: toolRunCtx, artifactName })

        const toolSet = step.exposeBuildToolSet(
          'multi-step-quote-test',
          toolRunCtx,
        )
        await toolSet.write_file.execute({
          path: `output/results/${artifactName}`,
          data: `body-${todoId}`,
          overwrite: true,
        })

        expect(toolLoopScopesPassed.at(-1)).toBe(toolRunCtx.stepInstanceKey)
        expect(toolLoopScopesPassed.at(-1)).not.toBe(parentKey)
      }

      const keys = todoRuns.map((r) => r.ctx.stepInstanceKey)
      expect(new Set(keys).size).toBe(3)

      for (const { ctx, artifactName } of todoRuns) {
        const ownPath = join(
          sandboxRoot,
          'output',
          'toolLoop',
          ...toolLoopPathSegments(ctx.stepInstanceKey),
          'results',
          artifactName,
        )
        expect(await pathExists(ownPath)).toBe(true)

        for (const other of todoRuns) {
          if (other.ctx.stepInstanceKey === ctx.stepInstanceKey) continue
          const otherPath = join(
            sandboxRoot,
            'output',
            'toolLoop',
            ...toolLoopPathSegments(other.ctx.stepInstanceKey),
            'results',
            artifactName,
          )
          expect(await pathExists(otherPath)).toBe(false)
        }

        const parentPath = join(
          sandboxRoot,
          'output',
          'toolLoop',
          ...toolLoopPathSegments(parentKey),
          'results',
          artifactName,
        )
        expect(await pathExists(parentPath)).toBe(false)
      }
    })

    it('would mis-route all todos to the parent folder if runCtx were omitted', async () => {
      const parentKey = parentCtx.stepInstanceKey
      parentCtx.beginStep()

      const toolSet = step.exposeBuildToolSet('multi-step-quote-test')
      await toolSet.write_file.execute({
        path: 'output/results/misroute.txt',
        data: 'only-parent',
        overwrite: true,
      })

      expect(toolLoopScopesPassed.at(-1)).toBe(parentKey)
      expect(
        await pathExists(
          join(
            sandboxRoot,
            'output',
            'toolLoop',
            ...toolLoopPathSegments(parentKey),
            'results',
            'misroute.txt',
          ),
        ),
      ).toBe(true)
    })
  })
})
