import type { WorkflowDefinition } from './schema'

export type WorkflowDeploymentKind = 'local' | 'agent-server'

export type DeployConfig = {
  enabled: boolean
  workspacePath?: string | null
  target?: WorkflowDeploymentTargetKind
  remoteUrl?: string
}

export type DeployHandle = {
  deploymentId: string
  kind: WorkflowDeploymentKind
  workflowId: string
  versionId: string
}

export type DeployStatus = {
  deploymentId: string
  kind: WorkflowDeploymentKind
  enabled: boolean
  lastRunAt: string | null
  lastError: string | null
}

export type WorkflowDeploymentTargetKind = WorkflowDeploymentKind

/** Abstraction for local vs remote workflow deployment (Phase D). */
export interface WorkflowDeploymentTarget {
  readonly kind: WorkflowDeploymentKind
  deploy(
    versionId: string,
    definition: WorkflowDefinition,
    config: DeployConfig,
  ): Promise<DeployHandle>
  undeploy(deploymentId: string): Promise<void>
  status(deploymentId: string): Promise<DeployStatus>
}

export type WorkflowRunMode = 'test' | 'production'

export type WorkflowTestReport = {
  runId: string
  workflowId: string
  versionId: string
  passed: boolean
  startedAt: string
  finishedAt: string
  steps: Array<{
    stepId: string
    title: string
    status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
    error?: string
    durationMs?: number
  }>
  mockHits: Array<{ kind: 'http' | 'tool'; match: string }>
  mockMisses: Array<{ kind: 'http' | 'tool'; request: string }>
  outputs: Record<string, unknown>
  errorMessage?: string
}
