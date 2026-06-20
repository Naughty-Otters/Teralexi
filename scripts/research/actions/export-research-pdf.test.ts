import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const exportMarkdownBodyToPdf = vi.hoisted(() =>
  vi.fn(async () => undefined),
)

vi.mock('../../../src/main/agent/sandbox/markdown-to-pdf', () => ({
  exportMarkdownBodyToPdf,
}))

import { exportResearchPdf } from './export-research-pdf'

describe('exportResearchPdf', () => {
  let sandboxRoot = ''
  let markdownRel = ''

  beforeEach(() => {
    vi.clearAllMocks()
    sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openfde-export-pdf-'))
    markdownRel = 'output/results/topic-research-paper.md'
    const markdownAbs = path.join(sandboxRoot, markdownRel)
    fs.mkdirSync(path.dirname(markdownAbs), { recursive: true })
    fs.writeFileSync(markdownAbs, '# Topic\n\n## Abstract\n\nBody.', 'utf8')

    const g = globalThis as unknown as Record<string, unknown>
    g.__OTTER_AGENT_SANDBOX_ROOT__ = sandboxRoot
    process.env.OTTER_AGENT_SANDBOX_ROOT = sandboxRoot
  })

  afterEach(() => {
    fs.rmSync(sandboxRoot, { recursive: true, force: true })
    delete process.env.OTTER_AGENT_SANDBOX_ROOT
    delete (globalThis as unknown as Record<string, unknown>).__OTTER_AGENT_SANDBOX_ROOT__
  })

  it('exports PDF using sandbox.root, not the requireActiveSandbox object', async () => {
    const result = await exportResearchPdf.execute({
      markdown_path: markdownRel,
    })

    expect(result).toMatchObject({
      success: true,
      markdown_path: markdownRel,
      pdf_path: 'output/results/topic-research-paper.pdf',
    })
    expect(exportMarkdownBodyToPdf).toHaveBeenCalledWith(
      expect.stringContaining('# Topic'),
      path.join(sandboxRoot, 'output/results/topic-research-paper.pdf'),
      'research-report',
    )
  })

  it('accepts nested path objects from tool calls', async () => {
    const result = await exportResearchPdf.execute({
      markdown_path: { path: markdownRel },
    })

    expect(result).toMatchObject({ success: true, markdown_path: markdownRel })
  })
})
