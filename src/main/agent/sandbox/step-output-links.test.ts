import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  buildOutputLinksFromPaths,
  collectOutputLinksForStep,
  filterSandboxPathsByThreadToolResults,
  formatExistingSandboxArtifactsBlock,
  formatStepOutputLinksMarkdown,
  isPathUnderDir,
  sandboxOutputDir,
} from './step-output-links'
import { TOOL_LOOP_STEP_ID } from '../constants/step-ids'

describe('step-output-links', () => {
  it('returns no links for missing paths', () => {
    expect(buildOutputLinksFromPaths(['/does/not/exist'])).toEqual([])
  })

  it('lists files under output directories only when present', () => {
    const root = mkdtempSync(join(tmpdir(), 'openfde-links-'))
    const results = join(root, 'results')
    mkdirSync(results, { recursive: true })
    writeFileSync(join(results, 'top-tags.md'), '# tags', 'utf8')

    const links = buildOutputLinksFromPaths([results, join(root, 'empty-dir')])
    expect(links.map((l) => l.label)).toEqual(['top-tags.md'])
  })

  it('excludes capture*.txt files from output link lists', () => {
    const root = mkdtempSync(join(tmpdir(), 'openfde-links-capture-'))
    const results = join(root, 'results')
    mkdirSync(results, { recursive: true })
    writeFileSync(join(results, 'report.md'), '# report', 'utf8')
    writeFileSync(join(results, 'capture-1234-abcd.txt'), 'stdout', 'utf8')

    const links = buildOutputLinksFromPaths([results])
    expect(links.map((l) => l.label)).toEqual(['report.md'])
  })

  it('formatExistingSandboxArtifactsBlock lists sandbox-relative output paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'openfde-artifacts-'))
    const outputRoot = sandboxOutputDir(root)
    const results = join(outputRoot, 'results')
    mkdirSync(results, { recursive: true })
    writeFileSync(
      join(results, 'cal-high-research-paper.md'),
      '# Paper',
      'utf8',
    )

    const block = formatExistingSandboxArtifactsBlock(root)
    expect(block).toContain('cal-high-research-paper.md')
    expect(block).toContain('output/results/cal-high-research-paper.md')
    expect(block).toContain('Do **not** restart work')
  })

  it('filterSandboxPathsByThreadToolResults keeps paths referenced in tool output', () => {
    const paths = [
      'output/results/cal-high-research-paper.md',
      'output/results/other-topic-paper.md',
    ]
    const results = [
      {
        id: 'r1',
        conversationId: 'c1',
        agentId: 'a1',
        stepId: 'toolLoop:1',
        toolName: 'write_file',
        inputSummary: 'output/results/cal-high-research-paper.md',
        outputText: JSON.stringify({
          path: 'output/results/cal-high-research-paper.md',
          success: true,
        }),
        outputSummary: '',
        outputChars: 100,
        isError: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        threadTag: 'performance',
      },
    ]
    expect(filterSandboxPathsByThreadToolResults(paths, results)).toEqual([
      'output/results/cal-high-research-paper.md',
    ])
  })

  it('restrictToDir excludes refs and scripts outside sandbox output/', () => {
    const root = mkdtempSync(join(tmpdir(), 'openfde-sandbox-'))
    const outputRoot = sandboxOutputDir(root)
    const results = join(outputRoot, 'results')
    const refs = join(root, 'refs')
    mkdirSync(results, { recursive: true })
    mkdirSync(refs, { recursive: true })
    writeFileSync(join(results, 'result-snapshot.pdf'), '%PDF-1.4', 'utf8')
    writeFileSync(join(refs, 'plan.md'), '# plan', 'utf8')

    const links = buildOutputLinksFromPaths([outputRoot, refs], {
      restrictToDir: outputRoot,
    })
    expect(links.map((l) => l.label)).toEqual(['result-snapshot.pdf'])
  })

  it('isPathUnderDir matches nested output paths', () => {
    const root = '/sandbox/output'
    expect(isPathUnderDir('/sandbox/output/toolLoop/step-1/results/x.md', root)).toBe(
      true,
    )
    expect(isPathUnderDir('/sandbox/refs/plan.md', root)).toBe(false)
  })

  it('formatStepOutputLinksMarkdown returns empty for no links', () => {
    expect(formatStepOutputLinksMarkdown([])).toBe('')
  })

  it('collectOutputLinksForStep scans shared output when tool loop rel dir is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'openfde-toolloop-scan-'))
    const outputRoot = sandboxOutputDir(root)
    const results = join(outputRoot, 'results')
    mkdirSync(results, { recursive: true })
    writeFileSync(join(results, 'deliverable.pdf'), '%PDF', 'utf8')

    const links = collectOutputLinksForStep(
      { stepId: TOOL_LOOP_STEP_ID, meta: {} },
      { getRoot: () => root } as never,
      {} as never,
    )
    expect(links.map((l) => l.label)).toContain('deliverable.pdf')
  })
})
