/**
 * Sandbox
 *
 * A per-run scratch directory that isolates an agent flow execution.
 *
 * Note: `skills/` holds a filesystem mirror for introspection / prompt context.
 * TypeScript skill actions are executed from the user skills directory
 * (`~/.teralexi/skills`) in-repo, not by bundling copied files here (isolated
 *
 * Layout:
 *   <root>/
 *     skills/         ← copy of the active skill folder + the shared toolSet
 *     refs/           ← copies of reference documents selected during planning
 *     scripts/        ← copies of reference scripts selected during planning
 *     output/         ← where the agent is told to write generated artifacts
 *
 * The sandbox root is intended to be used as the `cwd` for any shell command
 * or script the executor runs, so all side-effects of an execution stay
 * confined to a known directory the user can inspect afterwards.
 */

import {
  isBundledSkillId,
  materializeBundledSkillToDirectory,
} from '@main/skills/bundled-skills-manifest'
import { existsSync } from 'fs'
import { mkdir, cp, copyFile, rm } from 'fs/promises'
import { basename, extname, isAbsolute, join, normalize, sep } from 'path'
import { getTeralexiSandboxDir } from '@config/teralexi-home'
import { resolveUserSkillsDirectory } from '@main/skills/skill-path'
import {
  resolveSkillFolder,
  resolveUserToolSetDirectory,
} from '@main/skills/skill-path'
import { createLogger, instrumentInstanceMethods } from '@main/logger'
import { ReferenceContext } from '../resources/context'
import {
  isRemoteReferenceUrl,
  referenceDocBasename,
} from '../resources/reference-ops'
import { ReferenceDoc, ReferenceScript } from '../types'
import {
  buildSandboxInstructionBlock,
  buildSandboxStructureBlock,
  buildWorkspaceStructureBlock,
} from './instructions'
import { toolLoopFilesystemScopeFromStepKey } from '../run/flow-scoped-ids'
import {
  ensureToolLoopStepOutputDirs,
  toolLoopOutputRelBase,
} from './tool-loop-output'
import type {
  SandboxLayout,
  SandboxOptions,
  SandboxPlanningAccess,
  ToolLoopOutputLayout,
} from './types'

const log = createLogger('sandbox')

/**
 * True when `reference_url` resolves to an **existing** path under this sandbox
 * (e.g. already materialized under `refs/` or `scripts/`).
 */
export function referencePathAlreadyInSandbox(
  referenceUrl: string,
  layout: SandboxLayout,
): boolean {
  const ref = referenceUrl.trim()
  if (!ref || isRemoteReferenceUrl(ref)) return false

  const root = normalize(layout.root)
  const resolved = isAbsolute(ref)
    ? normalize(ref)
    : normalize(join(layout.root, ref.replace(/^[/\\]+/, '')))

  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    return false
  }
  return existsSync(resolved)
}

function uniqueSandboxRoot(): string {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  const rand = Math.random().toString(36).slice(2, 8)
  return join(getTeralexiSandboxDir(), `teralexi-sandbox-${stamp}-${rand}`)
}

function uniqueDestPath(dir: string, srcPath: string, taken: Set<string>) {
  const ext = extname(srcPath)
  const base = basename(srcPath, ext) || 'file'
  let candidate = `${base}${ext}`
  let counter = 1
  while (taken.has(candidate)) {
    candidate = `${base}-${counter}${ext}`
    counter += 1
  }
  taken.add(candidate)
  return join(dir, candidate)
}

/** Internal sandbox implementation; obtain via {@link getOrCreateSandboxForConversation}. */
export class Sandbox implements SandboxPlanningAccess {
  readonly layout: SandboxLayout
  private readonly sourceSkillsDir: string
  private readonly references: ReferenceContext
  private initialized = false
  private readonly takenRefNames = new Set<string>()
  private readonly takenScriptNames = new Set<string>()

  constructor(
    options: SandboxOptions = {},
    references: ReferenceContext = new ReferenceContext(),
  ) {
    this.references = references
    instrumentInstanceMethods(this, log)
    const root = options.root?.trim() || uniqueSandboxRoot()
    this.sourceSkillsDir = options.sourceSkillsDir ?? resolveUserSkillsDirectory()
    this.layout = {
      root,
      skillsDir: join(root, 'skills'),
      refsDir: join(root, 'refs'),
      scriptsDir: join(root, 'scripts'),
      outputDir: join(root, 'output'),
    }
  }

  /** Create the sandbox layout on disk. Safe to call multiple times. */
  async init(): Promise<void> {
    if (this.initialized) return
    await mkdir(this.layout.root, { recursive: true })
    await mkdir(this.layout.skillsDir, { recursive: true })
    await mkdir(this.layout.refsDir, { recursive: true })
    await mkdir(this.layout.scriptsDir, { recursive: true })
    await mkdir(this.layout.outputDir, { recursive: true })
    await mkdir(join(this.layout.outputDir, 'results'), { recursive: true })
    await mkdir(join(this.layout.outputDir, 'scripts'), { recursive: true })
    await mkdir(join(this.layout.outputDir, 'toolLoop'), { recursive: true })
    await mkdir(join(this.layout.root, 'input', 'uploads'), { recursive: true })
    this.initialized = true
  }

  /**
   * Per–tool-loop-step artifact dirs under `output/toolLoop/<scope>/`.
   * Shared `output/results` remains for run-level artifacts (e.g. result-snapshot.pdf).
   */
  resolveToolLoopOutputLayout(toolLoopScope: string): ToolLoopOutputLayout {
    const scope = toolLoopFilesystemScopeFromStepKey(toolLoopScope)
    const stepBase = join(this.layout.root, toolLoopOutputRelBase(scope))
    return {
      root: this.layout.root,
      outputDir: this.layout.outputDir,
      resultsDir: join(stepBase, 'results'),
      scriptsDir: join(stepBase, 'scripts'),
      refsDir: this.layout.refsDir,
      skillsDir: this.layout.skillsDir,
      toolLoopScope: scope,
      toolLoopOutputRelDir: toolLoopOutputRelBase(scope),
    }
  }

  ensureToolLoopStepOutputDirs(toolLoopScope: string): void {
    ensureToolLoopStepOutputDirs(this.layout.root, toolLoopScope)
  }

  /**
   * Copy the active skill folder and the shared `toolSet/` folder into the
   * sandbox so that any tool implementation the executor loads from this
   * sandbox is isolated from the source tree.
   */
  async copySkillAssets(skillId?: string): Promise<void> {
    await this.init()

    const userToolSet = resolveUserToolSetDirectory()
    if (existsSync(userToolSet)) {
      await cp(userToolSet, join(this.layout.skillsDir, 'toolSet'), {
        recursive: true,
      })
    }

    if (skillId) {
      const destSkill = join(this.layout.skillsDir, skillId)
      const srcSkill = resolveSkillFolder(skillId)
      if (srcSkill && existsSync(srcSkill)) {
        await cp(srcSkill, destSkill, { recursive: true })
      } else if (isBundledSkillId(skillId)) {
        materializeBundledSkillToDirectory(destSkill, skillId)
      }
    }
  }

  /**
   * Materialize a reference document into `<root>/refs/`.
   * Returns a new {@link ReferenceDoc} whose `reference_url` is the absolute path to the copy.
   * Local sources are resolved under the sandbox skills mirror when relative.
   * Remote `http(s)` URLs are downloaded into refs.
   * On failure, the original doc is returned unchanged so downstream loaders can surface the failure.
   */
  async copyReferenceDoc(
    doc: ReferenceDoc,
    skillId?: string,
  ): Promise<ReferenceDoc> {
    await this.init()
    const d = this.references.ensureReferenceDoc(
      doc as ReferenceDoc | Record<string, unknown>,
    )
    const ref = d.reference_url.trim()
    if (!ref) return d
    if (referencePathAlreadyInSandbox(ref, this.layout)) {
      return d
    }

    const refBase = referenceDocBasename(ref)
    const destHint =
      this.references.isRemoteReferenceUrl(ref) && refBase
        ? `${refBase.replace(/[/\\]/g, '-')}.ref`
        : ref

    const dest = uniqueDestPath(
      this.layout.refsDir,
      destHint,
      this.takenRefNames,
    )
    try {
      if (this.references.isRemoteReferenceUrl(ref)) {
        await this.references.writeRemoteReferenceToFile(ref, dest)
      } else {
        const src = this.references.resolveLocalSourcePathForReferenceCopy(
          ref,
          this.layout,
          skillId,
        )
        if (!src) {
          log.warn('copyReferenceDoc: could not resolve source path', {
            ref,
            sandboxRoot: this.layout.root,
            skillId,
          })
          return d
        }
        await copyFile(src, dest)
      }
      return new ReferenceDoc(dest)
    } catch (err) {
      log.warn('copyReferenceDoc failed', { ref, err })
      return d
    }
  }

  /**
   * Materialize a reference script into `<root>/scripts/`.
   * Returns a new {@link ReferenceScript} whose `reference_url` is the absolute path to the copy.
   */
  async copyReferenceScript(
    script: ReferenceScript,
    skillId?: string,
  ): Promise<ReferenceScript> {
    await this.init()
    const s = this.references.ensureReferenceScript(
      script as ReferenceScript | Record<string, unknown>,
    )
    const ref = s.reference_url.trim()
    if (!ref) return s
    if (referencePathAlreadyInSandbox(ref, this.layout)) {
      return s
    }

    const dest = uniqueDestPath(
      this.layout.scriptsDir,
      ref,
      this.takenScriptNames,
    )
    try {
      if (this.references.isRemoteReferenceUrl(ref)) {
        await this.references.writeRemoteReferenceToFile(ref, dest)
      } else {
        const src = this.references.resolveLocalSourcePathForReferenceCopy(
          ref,
          this.layout,
          skillId,
        )
        if (!src) {
          log.warn('copyReferenceScript: could not resolve source path', {
            ref,
            sandboxRoot: this.layout.root,
            skillId,
          })
          return s
        }
        await copyFile(src, dest)
      }
      return new ReferenceScript(s.script_type, dest)
    } catch (err) {
      log.warn('copyReferenceScript failed', { ref, err })
      return s
    }
  }

  async copyReferenceDocs(
    docs: ReferenceDoc[],
    skillId?: string,
  ): Promise<ReferenceDoc[]> {
    const out: ReferenceDoc[] = []
    for (const doc of docs) out.push(await this.copyReferenceDoc(doc, skillId))
    return out
  }

  async copyReferenceScripts(
    scripts: ReferenceScript[],
    skillId?: string,
  ): Promise<ReferenceScript[]> {
    const out: ReferenceScript[] = []
    for (const s of scripts)
      out.push(await this.copyReferenceScript(s, skillId))
    return out
  }

  /** Remove the sandbox directory tree. */
  async cleanup(): Promise<void> {
    if (!existsSync(this.layout.root)) return
    await rm(this.layout.root, { recursive: true, force: true })
    this.initialized = false
  }

  /**
   * Render a short summary of the sandbox layout. Useful for streaming
   * back to the user so they know where outputs land.
   */
  describe(): string {
    return [
      `📦 Sandbox: ${this.layout.root}`,
      `   • skills:  ${this.layout.skillsDir}`,
      `   • refs:    ${this.layout.refsDir}`,
      `   • scripts: ${this.layout.scriptsDir}`,
      `   • output:  ${this.layout.outputDir}`,
      `   • capture: ${join(this.layout.outputDir, 'results')} (run-level; tool-loop steps use output/toolLoop/<step>/)`,
      `   • toolLoop: ${join(this.layout.outputDir, 'toolLoop')} (per-step results/ and scripts/)`,
    ].join('\n')
  }

  /**
   * Build an instruction block injected into executor system prompts so the
   * model uses the sandbox as its working directory and writes artifacts to
   * the output folder.
   */
  private resolveStructureLayout(toolLoopScope?: string) {
    const scope = toolLoopScope?.trim()
      ? toolLoopFilesystemScopeFromStepKey(toolLoopScope)
      : undefined
    if (scope) {
      this.ensureToolLoopStepOutputDirs(scope)
      const scoped = this.resolveToolLoopOutputLayout(scope)
      return {
        root: scoped.root,
        outputDir: scoped.outputDir,
        resultsDir: scoped.resultsDir,
        scriptsDir: scoped.scriptsDir,
        referenceScriptsDir: this.layout.scriptsDir,
        refsDir: scoped.refsDir,
        skillsDir: scoped.skillsDir,
        toolLoopScope: scoped.toolLoopScope,
        toolLoopOutputRelDir: scoped.toolLoopOutputRelDir,
      }
    }
    return {
      root: this.layout.root,
      outputDir: this.layout.outputDir,
      resultsDir: join(this.layout.outputDir, 'results'),
      scriptsDir: join(this.layout.outputDir, 'scripts'),
      refsDir: this.layout.refsDir,
      skillsDir: this.layout.skillsDir,
    }
  }

  buildSandboxStructureBlock(toolLoopScope?: string): string {
    return buildSandboxStructureBlock(this.resolveStructureLayout(toolLoopScope))
  }

  buildWorkspaceStructureBlock(workspacePath?: string | null): string {
    return buildWorkspaceStructureBlock(workspacePath)
  }

  buildInstructionBlock(toolLoopScope?: string, workspacePath?: string | null): string {
    return buildSandboxInstructionBlock({
      ...this.resolveStructureLayout(toolLoopScope),
      workspacePath,
    })
  }
}
