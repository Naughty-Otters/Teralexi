import { unlink, writeFile } from 'node:fs/promises'
import { exportHtmlFileToPdf } from './html-to-pdf'
import { renderResearchReportHtmlDocument } from './research-report-html'
import { renderMarkdownToHtmlDocument } from './result-document-html'

export type MarkdownPdfDocumentKind = 'default' | 'research-report'

/** Renders markdown to a temporary HTML file, exports PDF, then removes the temp file. */
export async function exportMarkdownBodyToPdf(
  markdownBody: string,
  pdfPath: string,
  kind: MarkdownPdfDocumentKind = 'default',
): Promise<void> {
  const html =
    kind === 'research-report'
      ? renderResearchReportHtmlDocument(markdownBody)
      : renderMarkdownToHtmlDocument(markdownBody)
  const tmpHtml = `${pdfPath}.render-tmp.html`
  await writeFile(tmpHtml, html, 'utf8')
  try {
    await exportHtmlFileToPdf(tmpHtml, pdfPath)
  } finally {
    await unlink(tmpHtml).catch(() => undefined)
  }
}
