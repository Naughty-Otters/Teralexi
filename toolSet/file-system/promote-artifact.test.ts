import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OPENFDE_AGENT_SANDBOX_ROOT_ENV,
  OPENFDE_AGENT_WORKSPACE_PATH_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
  WORKSPACE_PATH_GLOBAL_KEY,
} from '../sandbox-paths'
import { classifySandboxArtifactPath } from '../run-script-artifacts'
import {
  planPromoteArtifact,
  promoteArtifact,
  previewPromoteArtifact,
} from './promote-artifact'

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[OPENFDE_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[OPENFDE_AGENT_SANDBOX_ROOT_ENV]
  }
}

function setWorkspaceRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[WORKSPACE_PATH_GLOBAL_KEY] = root
    process.env[OPENFDE_AGENT_WORKSPACE_PATH_ENV] = root
  } else {
    delete g[WORKSPACE_PATH_GLOBAL_KEY]
    delete process.env[OPENFDE_AGENT_WORKSPACE_PATH_ENV]
  }
}

describe('classifySandboxArtifactPath', () => {
  it('marks scratch and scripts as non-promotable or temp', () => {
    const root = '/sandbox'
    expect(
      classifySandboxArtifactPath(
        '/sandbox/output/toolLoop/step-1/scripts/run.py',
        root,
      ),
    ).toBe('non_promotable')
    expect(
      classifySandboxArtifactPath(
        '/sandbox/output/toolLoop/step-1/results/scratch/raw.json',
        root,
      ),
    ).toBe('temp')
    expect(
      classifySandboxArtifactPath(
        '/sandbox/output/toolLoop/step-1/results/report.html',
        root,
      ),
    ).toBe('deliverable')
  })
})

describe('promote_artifact tool', () => {
  let sandboxRoot: string
  let workspaceRoot: string

  beforeEach(async () => {
    sandboxRoot = await (async () => {
      const dir = path.join(tmpdir(), `promote-sb-${Date.now()}`)
      await mkdir(dir, { recursive: true })
      return dir
    })()
    workspaceRoot = await (async () => {
      const dir = path.join(tmpdir(), `promote-ws-${Date.now()}`)
      await mkdir(dir, { recursive: true })
      return dir
    })()

    const deliverableDir = path.join(
      sandboxRoot,
      'output',
      'toolLoop',
      'step-1',
      'results',
    )
    await mkdir(deliverableDir, { recursive: true })
    await writeFile(
      path.join(deliverableDir, 'generated.ts'),
      'export const x = 1\n',
      'utf-8',
    )

    const scratchDir = path.join(deliverableDir, 'scratch')
    await mkdir(scratchDir, { recursive: true })
    await writeFile(path.join(scratchDir, 'debug.log'), 'temp\n', 'utf-8')

    setSandboxRoot(sandboxRoot)
    setWorkspaceRoot(workspaceRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    setWorkspaceRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('requires a workspace folder', async () => {
    setWorkspaceRoot(undefined)
    const result = await promoteArtifact.execute({
      from: 'output/toolLoop/step-1/results/generated.ts',
      to: 'src/generated.ts',
    })
    expect(result).toMatchObject({
      error: expect.stringContaining('workspace'),
    })
  })

  it('rejects temp scratch files unless allowTemp is set', () => {
    const planned = planPromoteArtifact({
      from: 'output/toolLoop/step-1/results/scratch/debug.log',
      to: 'debug.log',
    })
    expect(planned.ok).toBe(false)
    if (planned.ok) return
    expect(planned.error).toContain('temporary')
  })

  it('previews and copies a deliverable into the workspace', async () => {
    const preview = await previewPromoteArtifact({
      from: 'output/toolLoop/step-1/results/generated.ts',
      to: 'src/generated.ts',
    })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.files[0]?.path).toBe('src/generated.ts')

    const result = await promoteArtifact.execute({
      from: 'output/toolLoop/step-1/results/generated.ts',
      to: 'src/generated.ts',
      mode: 'copy',
    })
    expect(result).toMatchObject({
      promoted: true,
      copied: true,
      to: 'src/generated.ts',
      files: [expect.objectContaining({ path: 'src/generated.ts', action: 'create' })],
    })

    const content = await readFile(
      path.join(workspaceRoot, 'src', 'generated.ts'),
      'utf-8',
    )
    expect(content).toContain('export const x = 1')
    const stillInSandbox = await readFile(
      path.join(
        sandboxRoot,
        'output',
        'toolLoop',
        'step-1',
        'results',
        'generated.ts',
      ),
      'utf-8',
    )
    expect(stillInSandbox).toContain('export const x = 1')
  })

  it('moves a deliverable into the workspace', async () => {
    const result = await promoteArtifact.execute({
      from: 'output/toolLoop/step-1/results/generated.ts',
      to: 'src/moved.ts',
      mode: 'move',
    })
    expect(result).toMatchObject({
      promoted: true,
      moved: true,
      to: 'src/moved.ts',
    })

    await expect(
      readFile(
        path.join(
          sandboxRoot,
          'output',
          'toolLoop',
          'step-1',
          'results',
          'generated.ts',
        ),
        'utf-8',
      ),
    ).rejects.toThrow()

    const content = await readFile(path.join(workspaceRoot, 'src', 'moved.ts'), 'utf-8')
    expect(content).toContain('export const x = 1')
  })
})
