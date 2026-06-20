import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtemp, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exportMarkdownBodyToPdf } from './markdown-to-pdf'

const capturedHtmlPaths: string[] = []

vi.mock('./html-to-pdf', () => ({
  exportHtmlFileToPdf: vi.fn(async (htmlPath: string, pdfPath: string) => {
    const { writeFile, readFile } = await import('node:fs/promises')
    capturedHtmlPaths.push(await readFile(htmlPath, 'utf8'))
    await writeFile(pdfPath, '%PDF-1.4 mock', 'utf8')
  }),
}))

describe('exportMarkdownBodyToPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedHtmlPaths.length = 0
  })

  it('writes research-report PDF with print-oriented HTML', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openfde-pdf-'))
    const pdfPath = join(dir, 'research-report.pdf')
    const markdown = '# AI Safety\n\n## Abstract\n\nThis report reviews key themes.'

    await exportMarkdownBodyToPdf(markdown, pdfPath, 'research-report')

    const pdf = await readFile(pdfPath, 'utf8')
    expect(pdf.startsWith('%PDF')).toBe(true)

    const { exportHtmlFileToPdf } = await import('./html-to-pdf')
    expect(exportHtmlFileToPdf).toHaveBeenCalledOnce()
    const html = capturedHtmlPaths[0] ?? ''
    expect(html).toContain('PdfSerif')
    expect(html).toContain('AI Safety')

    await unlink(pdfPath).catch(() => undefined)
  })
})
