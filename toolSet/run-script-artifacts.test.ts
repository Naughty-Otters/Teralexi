import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach } from 'vitest'
import {
  buildScriptArtifacts,
  filterDeliverableChangedPaths,
  findChangedFiles,
  snapshotDeliverableFiles,
  snapshotFilesUnderDir,
} from './run-script-artifacts'

describe('run-script-artifacts', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  it('detects new files and promotes a single deliverable as primary', async () => {
    dir = join(tmpdir(), `artifacts-${Date.now()}`)
    const resultsDir = join(dir, 'results')
    await mkdir(resultsDir, { recursive: true })
    const before = await snapshotFilesUnderDir(resultsDir)
    const deliverable = join(resultsDir, 'report.md')
    await writeFile(deliverable, '# Report', 'utf8')
    const after = await snapshotFilesUnderDir(resultsDir)
    const changed = findChangedFiles(before, after)
    expect(changed).toContain(deliverable)

    const capture = join(resultsDir, 'capture.txt')
    await writeFile(capture, 'log', 'utf8')
    const script = join(dir, 'scripts', 'run.py')
    await mkdir(join(dir, 'scripts'), { recursive: true })
    await writeFile(script, 'print(1)', 'utf8')

    const artifacts = buildScriptArtifacts({
      sandboxRoot: dir,
      scriptPath: script,
      captureAbsolutePath: capture,
      declaredPrimaryAbs: null,
      changedPaths: changed,
    })
    const primary = artifacts.find((a) => a.role === 'primary')
    expect(primary?.relPath).toMatch(/report\.md$/)
    expect(primary?.disposition).toBe('deliverable')
    expect(artifacts.find((a) => a.role === 'script')?.disposition).toBe(
      'non_promotable',
    )
  })

  it('snapshots step root and results but skips scripts/', async () => {
    dir = join(tmpdir(), `step-deliverables-${Date.now()}`)
    const stepBase = join(dir, 'output', 'toolLoop', 'step-a')
    const resultsDir = join(stepBase, 'results')
    const scriptsDir = join(stepBase, 'scripts')
    await mkdir(resultsDir, { recursive: true })
    await mkdir(scriptsDir, { recursive: true })

    const before = await snapshotDeliverableFiles(stepBase)
    await writeFile(join(stepBase, 'notes.md'), 'root note', 'utf8')
    await writeFile(join(resultsDir, 'report.md'), '# Report', 'utf8')
    await writeFile(join(scriptsDir, 'runner.py'), 'print(1)', 'utf8')
    const after = await snapshotDeliverableFiles(stepBase)
    const changed = filterDeliverableChangedPaths(
      findChangedFiles(before, after),
      stepBase,
    )

    expect(changed.some((p) => p.endsWith('notes.md'))).toBe(true)
    expect(changed.some((p) => p.endsWith('report.md'))).toBe(true)
    expect(changed.some((p) => p.endsWith('runner.py'))).toBe(false)
  })
})
