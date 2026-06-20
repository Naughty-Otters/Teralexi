import type { ReferenceDoc, ReferenceScript } from './reference-resource'
import {
  ensureReferenceDoc,
  ensureReferenceScript,
  isRemoteReferenceUrl,
  normalizeReferenceScriptType,
  referenceLocationString,
  resolveLocalSourcePathForReferenceCopy,
  resolveReferenceReadPathInSandbox,
  resolveReferenceUrlToFilesystemPath,
  writeRemoteReferenceToFile,
  type SandboxReferenceLayout,
} from './reference-ops'
import {
  ReferenceDoc as ReferenceDocCtor,
  ReferenceScript as ReferenceScriptCtor,
} from './reference-resource'

export type { ReferenceLoadContext, ReferenceLoadResult } from './reference-resource'

/**
 * Reference documents and scripts for agent flow clients.
 * Obtain via {@link AgentFlowContext.references} / {@link AgentStepContext.references}.
 */
export class ReferenceContext {
  static normalizeReferenceScriptType(
    raw: string | undefined,
  ): 'python' | 'node' | 'bash' {
    return normalizeReferenceScriptType(raw)
  }

  isRemoteReferenceUrl(s: string): boolean {
    return isRemoteReferenceUrl(s)
  }

  resolveReferenceUrlToFilesystemPath(
    referenceUrl: string,
    sandboxRoot: string,
  ): string {
    return resolveReferenceUrlToFilesystemPath(referenceUrl, sandboxRoot)
  }

  normalizeReferenceScriptType(
    raw: string | undefined,
  ): 'python' | 'node' | 'bash' {
    return normalizeReferenceScriptType(raw)
  }

  ensureReferenceDoc(d: ReferenceDoc | Record<string, unknown>): ReferenceDoc {
    return ensureReferenceDoc(d)
  }

  ensureReferenceScript(
    s: ReferenceScript | Record<string, unknown>,
  ): ReferenceScript {
    return ensureReferenceScript(s)
  }

  referenceLocationString(r: { reference_url?: string; path?: string }): string {
    return referenceLocationString(r)
  }

  resolveLocalSourcePathForReferenceCopy(
    reference_url: string,
    layout: { skillsDir: string; root: string },
    skillId?: string,
  ): string | null {
    return resolveLocalSourcePathForReferenceCopy(reference_url, layout, skillId)
  }

  resolveReferenceReadPathInSandbox(
    reference_url: string,
    layout: SandboxReferenceLayout,
    skillId?: string,
  ): string | null {
    return resolveReferenceReadPathInSandbox(reference_url, layout, skillId)
  }

  writeRemoteReferenceToFile(
    url: string,
    destPath: string,
    opts?: { abortSignal?: AbortSignal; fetchTimeoutMs?: number },
  ): Promise<void> {
    return writeRemoteReferenceToFile(url, destPath, opts)
  }

  docFromPlain(input: {
    name?: string
    path?: string
    reference_url?: string
  }): ReferenceDoc {
    return ReferenceDocCtor.fromPlain(input)
  }

  scriptFromPlain(input: {
    script_type?: string
    path?: string
    reference_url?: string
  }): ReferenceScript {
    return ReferenceScriptCtor.fromPlain(input)
  }
}
