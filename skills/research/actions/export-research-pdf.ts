/**
 * export_research_pdf — convert a sandbox markdown research paper to PDF.
 */

import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import type { SkillTool } from '../../../src/main/skills/types'
import {
  getOutputResultsRelPrefix,
  requireActiveSandbox,
  resolveSandboxRelativePath,
} from '../../../toolSet/sandbox-paths'
import { exportMarkdownBodyToPdf } from '../../../src/main/agent/sandbox/markdown-to-pdf'

const pathField = (label: string) =>
  z.preprocess((val) => {
    if (typeof val === 'string') return val.trim()
    if (val && typeof val === 'object') {
      const row = val as Record<string, unknown>
      for (const key of ['path', 'file_path', 'markdown_path', 'pdf_path']) {
        const candidate = row[key]
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim()
        }
      }
    }
    return val
  }, z.string().min(1, `${label} is required`))

const inputSchema = z.object({
  markdown_path: pathField('markdown_path').describe(
    'Sandbox-relative path to the research paper markdown (e.g. output/results/topic-research-paper.md).',
  ),
  pdf_path: pathField('pdf_path')
    .optional()
    .describe(
      'Sandbox-relative PDF output path. Defaults to the markdown path with a .pdf extension.',
    ),
})

export const exportResearchPdf: SkillTool = {
  name: 'export_research_pdf',
  tags: ['research'],
  description:
    'Export a research paper markdown file to a print-ready PDF under output/results/.',
  inputSchema,
  execute: async (raw) => {
    const input = inputSchema.parse(raw)
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) {
      throw new Error(sandbox.message)
    }
    const sandboxRoot = sandbox.root

    const markdownAbs = resolveSandboxRelativePath(
      sandboxRoot,
      input.markdown_path,
    )
    if (!fs.existsSync(markdownAbs)) {
      throw new Error(`markdown file not found: ${input.markdown_path}`)
    }

    const markdownBody = fs.readFileSync(markdownAbs, 'utf-8')
    const pdfRel =
      input.pdf_path?.trim() ||
      input.markdown_path.replace(/\.md$/i, '.pdf')
    const pdfAbs = resolveSandboxRelativePath(sandboxRoot, pdfRel)

    const resultsDir = path.join(sandboxRoot, getOutputResultsRelPrefix())
    fs.mkdirSync(resultsDir, { recursive: true })
    fs.mkdirSync(path.dirname(pdfAbs), { recursive: true })

    await exportMarkdownBodyToPdf(markdownBody, pdfAbs, 'research-report')

    return {
      success: true,
      markdown_path: input.markdown_path,
      pdf_path: pdfRel,
      filename: path.basename(pdfAbs),
      message: `Research paper exported: ${pdfRel}`,
    }
  },
}
