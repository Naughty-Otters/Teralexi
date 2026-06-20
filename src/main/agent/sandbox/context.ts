import type { ReferenceContext } from '../resources/context'
import type { PlanningResult } from '../types'
import type { SandboxPlanningAccess, SandboxReadyPayload } from './types'
import { getOrCreateSandboxForConversation } from './registry'
import { getOrCreateSandboxForSubAgentRun } from './sub-agent-registry'
import {
  clearAgentRunSandboxOutputScope,
  setAgentRunSandboxOutputScope,
  setAgentRunSandboxRoot,
} from './run-context'
import {
  defaultToolLoopPreviewDir as defaultToolLoopPreviewDirPath,
  toolLoopOutputRelBase as toolLoopOutputRelBasePath,
} from './paths'
import { materializePlanningSandboxReferences } from './planning-materialize'
import {
  buildSandboxReadyPayload,
  type BuildSandboxReadyPayloadInput,
} from './ready-payload'
import { writeFinalResultToSandbox } from './final-result'
import { getWorkspacePath } from '../workspace/conversation-workspace'
import {
  setAgentRunWorkspacePath,
  clearAgentRunWorkspacePath,
} from './run-context'

/**
 * Per-run sandbox workspace for agent flow clients.
 * Obtain via {@link AgentFlowContext.sandbox} / {@link AgentStepContext.sandbox}.
 */
export class SandboxContext {
  constructor(readonly references: ReferenceContext) {}

  private _planning?: SandboxPlanningAccess
  private _conversationId?: string

  /** Active planning sandbox for this run, if acquired. */
  get planning(): SandboxPlanningAccess | undefined {
    return this._planning
  }

  get layout() {
    return this._planning?.layout
  }

  getRoot(): string | undefined {
    return this._planning?.layout.root
  }

  buildInstructionBlock(toolLoopScope?: string): string {
    const workspacePath = this._conversationId
      ? getWorkspacePath(this._conversationId)
      : null
    return this._planning?.buildInstructionBlock(toolLoopScope, workspacePath) ?? ''
  }

  buildSandboxStructureBlock(toolLoopScope?: string): string {
    return this._planning?.buildSandboxStructureBlock(toolLoopScope) ?? ''
  }

  buildWorkspaceStructureBlock(): string {
    const workspacePath = this._conversationId
      ? getWorkspacePath(this._conversationId)
      : null
    return this._planning?.buildWorkspaceStructureBlock(workspacePath) ?? ''
  }

  getConversationId(): string | undefined {
    return this._conversationId
  }

  setConversationId(conversationId: string | undefined): void {
    const trimmed = conversationId?.trim()
    this._conversationId = trimmed || undefined
  }

  async acquireForConversation(
    conversationId: string | undefined,
    skillId?: string,
  ): Promise<SandboxPlanningAccess> {
    this.setConversationId(conversationId)
    this._planning = await getOrCreateSandboxForConversation(
      conversationId,
      skillId,
    )
    return this._planning
  }

  /** Isolated sandbox for a sub-agent run (not under the parent conversation sandbox). */
  async acquireForSubAgentRun(args: {
    agentId: string
    runId: string
    skillId?: string
    conversationId?: string
    rootRunId?: string
    parentRunId: string
  }): Promise<SandboxPlanningAccess> {
    this.setConversationId(args.conversationId)
    this._planning = await getOrCreateSandboxForSubAgentRun(args)
    return this._planning
  }

  attach(planning: SandboxPlanningAccess): void {
    this._planning = planning
  }

  /** Bind the per-run sandbox root to file tools. Workspace is separate — call {@link syncWorkspaceToTools}. */
  syncBindingToTools(): void {
    const root = this.getRoot()
    if (root) setAgentRunSandboxRoot(root)
  }

  /** Bind the conversation's user workspace path to file tools. */
  syncWorkspaceToTools(): void {
    const workspacePath = this._conversationId
      ? getWorkspacePath(this._conversationId)
      : null
    setAgentRunWorkspacePath(workspacePath ?? undefined)
  }

  clearBindingFromTools(): void {
    clearAgentRunSandboxOutputScope()
    setAgentRunSandboxRoot(undefined)
    clearAgentRunWorkspacePath()
  }

  activateToolLoopOutputScope(scope: string): void {
    const trimmed = scope.trim()
    if (!trimmed) return
    setAgentRunSandboxOutputScope(trimmed)
    this._planning?.ensureToolLoopStepOutputDirs(trimmed)
  }

  clearToolLoopOutputScope(): void {
    clearAgentRunSandboxOutputScope()
  }

  async materializePlanningReferences(
    plan: PlanningResult,
    skillId?: string,
  ): Promise<void> {
    if (!this._planning) {
      throw new Error('Cannot materialize planning references without an acquired sandbox.')
    }
    await materializePlanningSandboxReferences(
      this.references,
      this._planning,
      plan,
      skillId,
    )
  }

  defaultToolLoopPreviewDir(): string {
    return defaultToolLoopPreviewDirPath(this.getRoot() ?? '')
  }

  buildReadyPayload(input: BuildSandboxReadyPayloadInput): SandboxReadyPayload {
    return buildSandboxReadyPayload(input)
  }

  async writeFinalResult(
    finalContent: string,
  ): Promise<{
    outputResultsDir: string
    resultsFileUrl: string
    resultSnapshotPdfPath?: string
    resultSnapshotPdfUrl?: string
  } | null> {
    const root = this.getRoot()
    if (!root) return null
    return writeFinalResultToSandbox(root, finalContent)
  }

  toolLoopOutputRelBase(scope: string): string {
    return toolLoopOutputRelBasePath(scope)
  }
}
