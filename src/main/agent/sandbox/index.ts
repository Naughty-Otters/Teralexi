/**
 * Sandbox module — isolated per-conversation workspace for agent runs.
 *
 * **Public API is intentionally narrow.**
 *
 * Agent steps and other flow client code must use {@link SandboxContext} via
 * {@link AgentFlowContext.sandbox} / {@link AgentStepContext.sandbox} — not this
 * package directly.
 *
 * Skill tools and IPC may use:
 * - {@link getOrCreateSandboxForConversation} / {@link releaseConversationSandbox}
 * - {@link runWithExclusiveSandboxGlobals} / {@link getSandboxRootFromEnv} for tool binding
 * - Path helpers in this package (`resolveScopedSandboxPath`, etc.)
 *
 * The concrete {@link Sandbox} class is not exported; use {@link SandboxPlanningAccess}.
 */

export type {
  SandboxLayout,
  ToolLoopOutputLayout,
  SandboxAccess,
  SandboxPlanningAccess,
  SandboxReadyPayload,
  SandboxOptions,
} from './types'

export {
  getOrCreateSandboxForConversation,
  peekSandboxRootForConversation,
  resolveSandboxRootForConversation,
  releaseConversationSandbox,
} from './registry'

export {
  resolveSubAgentSandboxRoot,
  getOrCreateSandboxForSubAgentRun,
  listSubAgentSandboxRootsForConversation,
  releaseSubAgentSandboxesForConversation,
  releaseSubAgentSandbox,
  sanitizeAgentIdForSandboxPath,
  isSubAgentSandboxRoot,
  type SubAgentSandboxRecord,
} from './sub-agent-registry'

export {
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
  TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV,
  SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY,
  TERALEXI_AGENT_WORKSPACE_PATH_ENV,
  WORKSPACE_PATH_GLOBAL_KEY,
  TERALEXI_AGENT_CONVERSATION_ID_ENV,
  CONVERSATION_ID_GLOBAL_KEY,
  TERALEXI_AGENT_ASSISTANT_MESSAGE_ID_ENV,
  ASSISTANT_MESSAGE_ID_GLOBAL_KEY,
  setAgentRunSandboxRoot,
  getAgentRunSandboxRoot,
  setAgentRunSandboxOutputScope,
  getAgentRunSandboxOutputScope,
  clearAgentRunSandboxOutputScope,
} from './run-context'

export {
  getSandboxRootFromEnv,
  requireActiveSandbox,
  isPathInsideSandbox,
  resolveSandboxRelativePath,
  resolveScopedSandboxPath,
  resolvePathMustBeInside,
  resolvePathAllowingOutside,
  assertMoveAllowed,
  sandboxPathError,
  getWorkspacePathFromEnv,
  getConversationIdFromEnv,
  getAssistantMessageIdFromEnv,
  resolvePathInContext,
  resolveScopedPathInContext,
  isPathInsideWorkspace,
  isPathInFilesystemContext,
  isSandboxArtifactRelativePath,
  isPseudoAbsoluteProjectPath,
  resolveUserProjectPath,
  resolveRelativeInsideRoot,
  ensureToolLoopStepOutputDirs,
  getOutputResultsRelPrefix,
  getOutputScriptsRelPrefix,
  getSandboxOutputScopeFromEnv,
  remapLegacyPlanRelativePath,
  remapLegacySharedOutputPath,
  setSandboxOutputScope,
  toolLoopOutputRelBase,
  defaultToolLoopPreviewDir,
} from './paths'

export { buildSandboxReadyPayload } from './ready-payload'
export type { BuildSandboxReadyPayloadInput } from './ready-payload'
export { materializePlanningSandboxReferences } from './planning-materialize'

export {
  writeFinalResultToSandbox,
  FINAL_RESULT_FILENAME,
  RESULT_SNAPSHOT_PDF_FILENAME,
} from './final-result'

export { syncSandboxOutputView } from './output-view'
export { removeSandboxDirectories } from './cleanup'

export { buildSandboxInstructionBlock, SANDBOX_LLM } from './instructions'
export { SandboxContext } from './context'

export {
  runWithExclusiveSandboxGlobals,
  type SandboxGlobalsBindings,
  type SandboxGlobalsSnapshot,
} from './sandbox-globals-lock'
