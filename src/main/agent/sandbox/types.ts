import type { ReferenceDoc, ReferenceScript } from '../types'

/** Read-only directory layout for an agent sandbox workspace. */
export interface SandboxLayout {
  readonly root: string
  readonly skillsDir: string
  readonly refsDir: string
  readonly scriptsDir: string
  readonly outputDir: string
}

/** Per–tool-loop-step output directories under `output/toolLoop/<scope>/`. */
export interface ToolLoopOutputLayout {
  readonly root: string
  readonly outputDir: string
  readonly resultsDir: string
  readonly scriptsDir: string
  readonly refsDir: string
  readonly skillsDir: string
  readonly toolLoopScope: string
  readonly toolLoopOutputRelDir: string
}

/**
 * Narrow surface exposed to agent steps and context.
 * Does not expose `init`, `cleanup`, or `copySkillAssets`.
 */
export interface SandboxAccess {
  readonly layout: SandboxLayout
  describe(): string
  buildInstructionBlock(toolLoopScope?: string, workspacePath?: string | null): string
  buildSandboxStructureBlock(toolLoopScope?: string): string
  buildWorkspaceStructureBlock(workspacePath?: string | null): string
  resolveToolLoopOutputLayout(toolLoopScope: string): ToolLoopOutputLayout
  ensureToolLoopStepOutputDirs(toolLoopScope: string): void
}

/**
 * Planning-time operations (reference materialization into the sandbox).
 * Used by the flow runtime when applying planning results.
 */
export interface SandboxPlanningAccess extends SandboxAccess {
  copyReferenceDoc(doc: ReferenceDoc, skillId?: string): Promise<ReferenceDoc>
  copyReferenceScript(
    script: ReferenceScript,
    skillId?: string,
  ): Promise<ReferenceScript>
  copyReferenceDocs(
    docs: ReferenceDoc[],
    skillId?: string,
  ): Promise<ReferenceDoc[]>
  copyReferenceScripts(
    scripts: ReferenceScript[],
    skillId?: string,
  ): Promise<ReferenceScript[]>
}

/** IPC / renderer notification when a sandbox is ready for a run. */
export interface SandboxReadyPayload {
  conversationId: string
  sandboxRoot: string
  outputResultsDir: string
  resultsFileUrl: string
  /** `file://` URL for {@link RESULT_SNAPSHOT_PDF_FILENAME} when PDF export succeeded. */
  resultSnapshotPdfUrl?: string
}

export interface SandboxOptions {
  root?: string
  sourceSkillsDir?: string
}
