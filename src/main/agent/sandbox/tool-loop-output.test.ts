/**
 * Integration tests: per–tool-loop-step sandbox output isolation.
 *
 * Use case 1 — Each step's writes (and scoped reads) stay under
 * `output/toolLoop/<stepKey>/`; shared `refs/` and reference `scripts/` are unchanged.
 *
 * Use case 2 — A later step reads the correct artifact from another step's folder
 * via an explicit path, and from its own folder via legacy `output/results/...`.
 */
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindSandboxGlobalsForTools } from './sandbox-globals-lock'
import { getSandboxOutputScopeFromEnv } from './paths'
import {
  ensureToolLoopStepOutputDirs,
  getOutputResultsRelPrefix,
  toolLoopOutputRelBase,
} from './tool-loop-output'
import { readFile as readFileTool, writeFile as writeFileTool } from '@toolSet/file-system'
import { runScript } from '@toolSet/shell-command'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', () => ({
  execFile: execFileMock,
}))

let activeSandboxRoot: string | undefined

function setSandboxRoot(root: string | undefined) {
  activeSandboxRoot = root
  bindSandboxGlobalsForTools({ root, outputScope: undefined })
}

function syncSandboxGlobals(outputScope?: string) {
  bindSandboxGlobalsForTools({
    root: activeSandboxRoot,
    outputScope,
  })
}

function mockExecSuccess(stdout = 'ok\n') {
  execFileMock.mockImplementation(
    (
      _file: string,
      _args: string[],
      opts: unknown,
      maybeCb?: unknown,
    ) => {
      const cb =
        typeof opts === 'function'
          ? (opts as (err: Error | null, stdout: string, stderr: string) => void)
          : (maybeCb as (err: Error | null, stdout: string, stderr: string) => void)
      cb(null, stdout, '')
      return undefined as never
    },
  )
}

function stepResultsDir(sandboxRoot: string, stepKey: string): string {
  return join(sandboxRoot, getOutputResultsRelPrefix(stepKey))
}

function stepArtifactPath(
  sandboxRoot: string,
  stepKey: string,
  fileName: string,
): string {
  return join(stepResultsDir(sandboxRoot, stepKey), fileName)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

describe('toolLoopOutputRelBase', () => {
  it('maps scoped toolLoop step keys without duplicating the toolLoop segment', () => {
    expect(toolLoopOutputRelBase('conv:msg::toolLoop:abc12345')).toBe(
      join('output', 'toolLoop', 'abc12345'),
    )
    expect(toolLoopOutputRelBase('toolLoop/abc12345')).toBe(
      join('output', 'toolLoop', 'abc12345'),
    )
  })
})

describe('tool-loop per-step sandbox output', () => {
  let sandboxRoot: string
  const stepKeyA = '11111111-aaaa-bbbb-cccc-step-a'
  const stepKeyB = '22222222-dddd-eeee-ffff-step-b'
  /** Simulates the batch-level SkillsToolExecutionStep parent context (first key). */
  const staleParentStepKey = '00000000-parent-batch-tool-loop'

  beforeEach(async () => {
    execFileMock.mockReset()
    sandboxRoot = await mkdtemp(join(tmpdir(), 'openfde-tool-loop-out-'))
    setSandboxRoot(sandboxRoot)
    await mkdir(join(sandboxRoot, 'refs'), { recursive: true })
    await mkdir(join(sandboxRoot, 'scripts'), { recursive: true })
    await writeFile(join(sandboxRoot, 'refs', 'planning-seed.md'), 'ref-only', {
      encoding: 'utf-8',
    })
    await writeFile(
      join(sandboxRoot, 'scripts', 'reference-helper.sh'),
      '#!/bin/bash\necho ref-script',
      { encoding: 'utf-8' },
    )
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  describe('regression: tool scope must match active step, not parent batch context', () => {
    it('writes follow the scope key passed at tool invocation (not a stale parent)', async () => {
      // Correct: beginStep on todo B, tools pass stepKeyB (fixed buildToolSet).
      syncSandboxGlobals(stepKeyB)
      ensureToolLoopStepOutputDirs(sandboxRoot, stepKeyB)
      await writeFileTool.execute({
        path: 'output/results/regression-b.txt',
        data: 'in-b',
        overwrite: true,
      })
      expect(getSandboxOutputScopeFromEnv()).toBe(stepKeyB)
      expect(
        await pathExists(
          stepArtifactPath(sandboxRoot, stepKeyB, 'regression-b.txt'),
        ),
      ).toBe(true)

      // Bug pattern: beginStep set B, but buildToolSet used parent key → callSkillToolDirect
      // overwrote global scope to staleParentStepKey before each tool call.
      syncSandboxGlobals(stepKeyB)
      syncSandboxGlobals(staleParentStepKey)
      ensureToolLoopStepOutputDirs(sandboxRoot, staleParentStepKey)
      await writeFileTool.execute({
        path: 'output/results/regression-wrong.txt',
        data: 'in-parent',
        overwrite: true,
      })
      expect(
        await pathExists(
          stepArtifactPath(sandboxRoot, staleParentStepKey, 'regression-wrong.txt'),
        ),
      ).toBe(true)
      expect(
        await pathExists(
          stepArtifactPath(sandboxRoot, stepKeyB, 'regression-wrong.txt'),
        ),
      ).toBe(false)
    })
  })

  describe('use case 1: each step writes only under its own step key', () => {
    it('isolates write_file, run_script, and legacy output/results paths per step', async () => {
      // --- Step A ---
      syncSandboxGlobals(stepKeyA)
      ensureToolLoopStepOutputDirs(sandboxRoot, stepKeyA)

      const writeA = await writeFileTool.execute({
        path: 'output/results/step-a-artifact.md',
        data: 'content-from-step-a',
        overwrite: true,
      })
      expect(writeA).toMatchObject({ written: true })
      expect((writeA as { path: string }).path).toBe(
        stepArtifactPath(sandboxRoot, stepKeyA, 'step-a-artifact.md'),
      )

      mockExecSuccess('capture-a\n')
      const scriptA = await runScript.execute({
        scriptType: 'python',
        scriptContent: 'print("a")',
        captureRelativePath: 'run-a-capture.txt',
      })
      expect(scriptA).toMatchObject({ success: true })
      expect(
        await pathExists(
          stepArtifactPath(sandboxRoot, stepKeyA, 'run-a-capture.txt'),
        ),
      ).toBe(true)

      syncSandboxGlobals()

      // --- Step B ---
      syncSandboxGlobals(stepKeyB)
      ensureToolLoopStepOutputDirs(sandboxRoot, stepKeyB)

      const writeB = await writeFileTool.execute({
        path: 'output/results/step-b-artifact.md',
        data: 'content-from-step-b',
        overwrite: true,
      })
      expect((writeB as { path: string }).path).toBe(
        stepArtifactPath(sandboxRoot, stepKeyB, 'step-b-artifact.md'),
      )

      mockExecSuccess('capture-b\n')
      await runScript.execute({
        scriptType: 'python',
        scriptContent: 'print("b")',
        captureRelativePath: 'run-b-capture.txt',
      })

      // Step B folders must not contain Step A artifacts
      expect(
        await pathExists(
          stepArtifactPath(sandboxRoot, stepKeyB, 'step-a-artifact.md'),
        ),
      ).toBe(false)
      expect(
        await pathExists(
          stepArtifactPath(sandboxRoot, stepKeyB, 'run-a-capture.txt'),
        ),
      ).toBe(false)

      // Step A folders must not contain Step B artifacts
      expect(
        await pathExists(
          stepArtifactPath(sandboxRoot, stepKeyA, 'step-b-artifact.md'),
        ),
      ).toBe(false)
      expect(
        await pathExists(
          stepArtifactPath(sandboxRoot, stepKeyA, 'run-b-capture.txt'),
        ),
      ).toBe(false)

      // Shared output/results must not receive step artifacts
      expect(
        await pathExists(
          join(sandboxRoot, 'output', 'results', 'step-a-artifact.md'),
        ),
      ).toBe(false)
      expect(
        await pathExists(
          join(sandboxRoot, 'output', 'results', 'step-b-artifact.md'),
        ),
      ).toBe(false)

      // Refs and reference scripts stay at sandbox root (not under toolLoop)
      expect(await readFile(join(sandboxRoot, 'refs', 'planning-seed.md'), 'utf-8')).toBe(
        'ref-only',
      )
      expect(
        await readFile(join(sandboxRoot, 'scripts', 'reference-helper.sh'), 'utf-8'),
      ).toContain('ref-script')
      expect(
        await pathExists(
          join(sandboxRoot, 'output', 'toolLoop', stepKeyA, 'refs'),
        ),
      ).toBe(false)
      expect(
        await pathExists(
          join(
            sandboxRoot,
            toolLoopOutputRelBase(stepKeyA),
            'scripts',
            'reference-helper.sh',
          ),
        ),
      ).toBe(false)
    })

    it('does not remap refs/ paths into the active tool-loop scope', async () => {
      syncSandboxGlobals(stepKeyA)
      ensureToolLoopStepOutputDirs(sandboxRoot, stepKeyA)

      const readRef = await readFileTool.execute({
        path: 'refs/planning-seed.md',
      })
      expect(readRef).toMatchObject({ content: '1: ref-only' })
      expect((readRef as { path: string }).path).toBe(
        join(sandboxRoot, 'refs', 'planning-seed.md'),
      )
      expect((readRef as { path: string }).path).not.toContain(
        join('toolLoop', stepKeyA),
      )
    })
  })

  describe('use case 2: each step reads from the correct folder path', () => {
    it('step B reads step A output via explicit toolLoop path and its own via legacy path', async () => {
      // Step A produces a handoff artifact
      syncSandboxGlobals(stepKeyA)
      ensureToolLoopStepOutputDirs(sandboxRoot, stepKeyA)
      await writeFileTool.execute({
        path: 'output/results/handoff.json',
        data: '{"from":"step-a"}',
        overwrite: true,
      })
      syncSandboxGlobals()

      // Step B reads A's file using explicit cross-step path
      syncSandboxGlobals(stepKeyB)
      ensureToolLoopStepOutputDirs(sandboxRoot, stepKeyB)

      const crossStepPath = join(
        toolLoopOutputRelBase(stepKeyA),
        'results',
        'handoff.json',
      )
      const readFromA = await readFileTool.execute({ path: crossStepPath })
      expect(readFromA).toMatchObject({ content: '1: {"from":"step-a"}' })
      expect((readFromA as { path: string }).path).toBe(
        stepArtifactPath(sandboxRoot, stepKeyA, 'handoff.json'),
      )

      // Step B writes and reads its own artifact via legacy output/results path
      await writeFileTool.execute({
        path: 'output/results/local.json',
        data: '{"from":"step-b"}',
        overwrite: true,
      })
      const readOwn = await readFileTool.execute({
        path: 'output/results/local.json',
      })
      expect(readOwn).toMatchObject({ content: '1: {"from":"step-b"}' })
      expect((readOwn as { path: string }).path).toBe(
        stepArtifactPath(sandboxRoot, stepKeyB, 'local.json'),
      )

      // Legacy path must not resolve to step A's file when names differ
      const readWrong = await readFileTool.execute({
        path: 'output/results/handoff.json',
      })
      expect(readWrong).toMatchObject({
        error: expect.stringContaining('not found'),
      })
    })

    it('same legacy filename in two steps yields independent contents', async () => {
      const sharedName = 'quotes-raw.json'

      syncSandboxGlobals(stepKeyA)
      ensureToolLoopStepOutputDirs(sandboxRoot, stepKeyA)
      await writeFileTool.execute({
        path: `output/results/${sharedName}`,
        data: '["quote-a"]',
        overwrite: true,
      })
      syncSandboxGlobals()

      syncSandboxGlobals(stepKeyB)
      ensureToolLoopStepOutputDirs(sandboxRoot, stepKeyB)
      await writeFileTool.execute({
        path: `output/results/${sharedName}`,
        data: '["quote-b"]',
        overwrite: true,
      })

      const readB = await readFileTool.execute({
        path: `output/results/${sharedName}`,
      })
      expect(readB).toMatchObject({ content: '1: ["quote-b"]' })

      const readAExplicit = await readFileTool.execute({
        path: join(toolLoopOutputRelBase(stepKeyA), 'results', sharedName),
      })
      expect(readAExplicit).toMatchObject({ content: '1: ["quote-a"]' })
    })
  })
})
