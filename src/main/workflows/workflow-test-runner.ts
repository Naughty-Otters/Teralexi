import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getWorkflowSandboxDir } from '@config/teralexi-home'
import { ConfigContext } from '@main/agent/config/context'
import { createLogger } from '@main/logger'
import { getConversationStore } from '@main/services/conversation-store'
import { randomShortUuid } from '@shared/utils/short-uuid'
import type { WorkflowTestReport } from '@shared/workflows/deployment-target'
import type { WorkflowDefinition } from '@shared/workflows/schema'
import { createMockRegistry } from './mock-registry'
import {
  loadWorkflowDefinitionFromVersion,
  persistWorkflowSandboxArtifact,
} from './workflow-store'
import type { StoredWorkflowVersion } from '@main/services/conversation-store/types'
import { runWorkflowViaAgentFlow } from './workflow-agent-run'

const log = createLogger('workflows.test-runner')

export type WorkflowTestRunRequest = {
  workflowId: string
  version: StoredWorkflowVersion
  inputs?: Record<string, unknown>
}

export type WorkflowTestRunResult = {
  report: WorkflowTestReport
  sandboxRunId: string
}

function initializeTestSandbox(
  workflowId: string,
  runId: string,
  definition: WorkflowDefinition,
): string {
  const root = getWorkflowSandboxDir(workflowId, runId)
  mkdirSync(join(root, 'mocks'), { recursive: true })
  mkdirSync(join(root, 'fixtures'), { recursive: true })
  mkdirSync(join(root, 'output'), { recursive: true })
  mkdirSync(join(root, 'plans'), { recursive: true })
  mkdirSync(join(root, 'logs'), { recursive: true })

  persistWorkflowSandboxArtifact(
    workflowId,
    runId,
    'workflow.json',
    JSON.stringify(definition, null, 2),
  )

  if (definition.mocks) {
    writeFileSync(
      join(root, 'mocks', 'http.json'),
      JSON.stringify(definition.mocks.http ?? [], null, 2),
      'utf-8',
    )
    writeFileSync(
      join(root, 'mocks', 'tools.json'),
      JSON.stringify(definition.mocks.tools ?? [], null, 2),
      'utf-8',
    )
  }

  return root
}

function mapStepStatuses(
  definition: WorkflowDefinition,
  success: boolean,
): WorkflowTestReport['steps'] {
  return definition.steps.map((step) => ({
    stepId: step.id,
    title: 'title' in step ? (step.title ?? step.id) : step.id,
    status: success ? ('passed' as const) : ('failed' as const),
  }))
}

/** Execute a confirmed workflow in an isolated test sandbox via AgentFlow. */
export async function runWorkflowTest(
  request: WorkflowTestRunRequest,
): Promise<WorkflowTestRunResult> {
  const startedAt = new Date().toISOString()
  const runId = `test-${randomShortUuid()}`
  const definition = loadWorkflowDefinitionFromVersion(request.version)

  if (definition.status !== 'confirmed' && definition.status !== 'testing') {
    throw new Error('Only confirmed workflows can be tested')
  }

  const workflow = getConversationStore().getWorkflow(request.workflowId)
  const userId = workflow?.userId ?? ConfigContext.DEFAULT_USER_ID

  const sandboxRoot = initializeTestSandbox(
    request.workflowId,
    runId,
    definition,
  )
  const mockRegistry = createMockRegistry(definition.mocks, 'test')

  const conversationId = `workflow:test:${request.workflowId}:${runId}`
  const inputs = request.inputs ?? {}

  let passed = true
  let errorMessage: string | undefined
  let steps = mapStepStatuses(definition, true)
  let runLog: Record<string, unknown> = {}

  try {
    const result = await runWorkflowViaAgentFlow({
      userId,
      definition,
      inputs,
      conversationId,
      runId,
    })

    passed = result.success
    steps = mapStepStatuses(definition, result.success)
    runLog = {
      success: result.success,
      hitlPaused: result.hitlPaused,
      structuredContentLength: result.structuredContent.length,
      stepOutputs: result.stepOutputs,
      ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
    }

    if (!result.success) {
      errorMessage = result.errorMessage ?? 'Workflow test run failed'
    }

    persistWorkflowSandboxArtifact(
      request.workflowId,
      runId,
      join('logs', 'run.jsonl'),
      JSON.stringify(runLog),
    )
  } catch (err: unknown) {
    passed = false
    errorMessage = err instanceof Error ? err.message : String(err)
    steps = mapStepStatuses(definition, false)
    log.error('Workflow test run failed', {
      workflowId: request.workflowId,
      runId,
      err,
    })
  }

  const finishedAt = new Date().toISOString()
  const report: WorkflowTestReport = {
    runId,
    workflowId: request.workflowId,
    versionId: request.version.id,
    passed,
    startedAt,
    finishedAt,
    steps,
    mockHits: mockRegistry.hits,
    mockMisses: mockRegistry.misses,
    outputs: { sandboxRoot, ...inputs },
    ...(errorMessage ? { errorMessage } : {}),
  }

  return { report, sandboxRunId: runId }
}
