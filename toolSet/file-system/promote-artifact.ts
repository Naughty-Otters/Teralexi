import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  isPathInsideSandbox,
  isPathInsideWorkspace,
  remapLegacySharedOutputPath,
  requireActiveSandbox,
  resolvePathInContext,
  resolvePathMustBeInside,
  getWorkspacePathFromEnv,
  sandboxPathError,
} from '../sandbox-paths'
import {
  classifySandboxArtifactPath,
  type ArtifactDisposition,
} from '../run-script-artifacts'
import { FILE_SYSTEM_TAG, SANDBOX_ARTIFACT_HINT, WORKSPACE_PATH_HINT } from './constants'
import {
  buildFileChangePreview,
  movePath,
  readTextFileIfExists,
  toToolDisplayPath,
} from './file-io-utils'

const promoteInputSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  mode: z.enum(['copy', 'move']).optional().default('copy'),
  overwrite: z.boolean().optional().default(false),
  allowTemp: z.boolean().optional().default(false),
})

export type PromoteArtifactPlan = {
  sourcePath: string
  destPath: string
  mode: 'copy' | 'move'
  overwrite: boolean
  disposition: ArtifactDisposition
  workspacePath: string
  sandboxRoot: string
  sourceDisplayPath: string
  destDisplayPath: string
}

function requireWorkspacePath(): { ok: true; path: string } | { ok: false; error: string } {
  const workspacePath = getWorkspacePathFromEnv()
  if (!workspacePath?.trim()) {
    return {
      ok: false,
      error:
        'promote_artifact requires a workspace folder. Ask the user to select their project folder first.',
    }
  }
  return { ok: true, path: workspacePath.trim() }
}

function resolveSandboxSourcePath(sandboxRoot: string, userPath: string): string {
  const trimmed = userPath.trim()
  return resolvePathMustBeInside(
    sandboxRoot,
    remapLegacySharedOutputPath(trimmed),
  )
}

export function planPromoteArtifact(input: Record<string, unknown>):
  | { ok: true; plan: PromoteArtifactPlan }
  | { ok: false; error: string } {
  const parsed = promoteInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Invalid promote_artifact input.' }
  }

  const sandbox = requireActiveSandbox()
  if (!sandbox.ok) return { ok: false, error: sandbox.message }

  const ws = requireWorkspacePath()
  if (!ws.ok) return ws

  const { from, to, mode, overwrite, allowTemp } = parsed.data

  let sourcePath: string
  let destPath: string
  try {
    sourcePath = resolveSandboxSourcePath(sandbox.root, from)
    destPath = resolvePathInContext(sandbox.root, ws.path, to)
  } catch (err) {
    return sandboxPathError(err) as { ok: false; error: string }
  }

  if (!isPathInsideSandbox(sandbox.root, sourcePath)) {
    return { ok: false, error: `Source must be inside the sandbox: ${from}` }
  }
  if (isPathInsideWorkspace(ws.path, sourcePath)) {
    return {
      ok: false,
      error:
        'Source is already in the workspace. Use edit_file or write_file for in-repo changes.',
    }
  }
  if (!isPathInsideWorkspace(ws.path, destPath)) {
    return { ok: false, error: `Destination must be inside the workspace: ${to}` }
  }

  const disposition = classifySandboxArtifactPath(sourcePath, sandbox.root)
  if (disposition === 'non_promotable') {
    return {
      ok: false,
      error:
        `Cannot promote ${from}: sandbox scripts and read-only dirs are not promotable. Pick a file under output/ or step results/.`,
    }
  }
  if (disposition === 'temp' && !allowTemp) {
    return {
      ok: false,
      error:
        `Cannot promote ${from}: classified as temporary scratch output. Use a deliverable under results/, or set allowTemp: true if intentional.`,
    }
  }

  return {
    ok: true,
    plan: {
      sourcePath,
      destPath,
      mode,
      overwrite,
      disposition,
      workspacePath: ws.path,
      sandboxRoot: sandbox.root,
      sourceDisplayPath: toToolDisplayPath(sourcePath, sandbox.root, ws.path),
      destDisplayPath: toToolDisplayPath(destPath, sandbox.root, ws.path),
    },
  }
}

async function buildPromotePreview(plan: PromoteArtifactPlan) {
  const sourceStats = await fs.stat(plan.sourcePath).catch(() => null)
  if (!sourceStats?.isFile()) {
    throw new Error(`Source is not a file: ${plan.sourceDisplayPath}`)
  }

  const destExists = await fs.stat(plan.destPath).then(() => true).catch(() => false)
  if (destExists && !plan.overwrite) {
    throw new Error(`Destination already exists: ${plan.destDisplayPath}`)
  }

  const sourceContent = (await readTextFileIfExists(plan.sourcePath)) ?? ''
  const destOld = destExists ? ((await readTextFileIfExists(plan.destPath)) ?? '') : ''

  const action = destExists ? 'modify' : 'create'
  const fileChange = buildFileChangePreview(
    plan.sandboxRoot,
    plan.destPath,
    destOld,
    sourceContent,
    {
      action,
      moveFrom: plan.mode === 'move' ? plan.sourcePath : undefined,
      workspacePath: plan.workspacePath,
    },
  )

  return { fileChange, destExists, sourceContent, destOld }
}

export const promoteArtifact: SkillTool = {
  name: 'promote_artifact',
  tags: [...FILE_SYSTEM_TAG],
  description:
    'Copy or move a sandbox step deliverable into the user workspace. ' +
    `Use after run_script when a file under output/toolLoop/.../results/ should become part of the project. ` +
    `${WORKSPACE_PATH_HINT} Source must be a sandbox path (e.g. output/toolLoop/step-1/results/report.html). ` +
    `Destination is workspace-relative (e.g. src/generated.ts). Temp/scratch files require allowTemp: true. ` +
    `${SANDBOX_ARTIFACT_HINT}`,
  inputSchema: promoteInputSchema,
  needsApproval: true,
  async execute(input) {
    const planned = planPromoteArtifact(input as Record<string, unknown>)
    if (!planned.ok) return { error: planned.error }

    const plan = planned.plan
    try {
      const { fileChange, destExists, sourceContent, destOld } =
        await buildPromotePreview(plan)

      if (plan.mode === 'move') {
        await movePath(plan.sourcePath, plan.destPath, plan.overwrite)
        return {
          promoted: true,
          moved: true,
          mode: plan.mode,
          disposition: plan.disposition,
          from: plan.sourceDisplayPath,
          to: plan.destDisplayPath,
          path: plan.destPath,
          sandboxRoot: plan.sandboxRoot,
          workspacePath: plan.workspacePath,
          diff: fileChange.diff,
          additions: fileChange.additions,
          deletions: fileChange.deletions,
          files: [fileChange],
        }
      }

      if (destExists && !plan.overwrite) {
        return { error: `Destination already exists: ${plan.destDisplayPath}` }
      }

      await fs.mkdir(path.dirname(plan.destPath), { recursive: true })
      await fs.copyFile(plan.sourcePath, plan.destPath)

      const resultFileChange = buildFileChangePreview(
        plan.sandboxRoot,
        plan.destPath,
        destOld,
        sourceContent,
        {
          action: destExists ? 'modify' : 'create',
          workspacePath: plan.workspacePath,
        },
      )

      return {
        promoted: true,
        copied: true,
        mode: plan.mode,
        disposition: plan.disposition,
        from: plan.sourceDisplayPath,
        to: plan.destDisplayPath,
        path: plan.destPath,
        sandboxRoot: plan.sandboxRoot,
        workspacePath: plan.workspacePath,
        diff: resultFileChange.diff,
        additions: resultFileChange.additions,
        deletions: resultFileChange.deletions,
        files: [resultFileChange],
      }
    } catch (error) {
      return { error: String(error) }
    }
  },
}

export async function previewPromoteArtifact(
  input: Record<string, unknown>,
): Promise<
  | { ok: true; files: ReturnType<typeof buildFileChangePreview>[] }
  | { ok: false; error: string }
> {
  const planned = planPromoteArtifact(input)
  if (!planned.ok) return planned

  try {
    const { fileChange } = await buildPromotePreview(planned.plan)
    return { ok: true, files: [fileChange] }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
