export type BubblePdfDocumentKind = 'default' | 'research-report'

const RESEARCH_REPORT_SECTION_IDS = new Set([
  'ReportStep',
  'report',
  'researchReport',
  'CreatePaperStep',
  'createPaper',
])

export function bubblePdfKindForSection(sectionId: string): BubblePdfDocumentKind {
  return RESEARCH_REPORT_SECTION_IDS.has(sectionId)
    ? 'research-report'
    : 'default'
}

export function bubblePdfDefaultFileName(
  sectionTitle: string,
  messageId: string,
): string {
  const slug =
    sectionTitle
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'bubble'
  const idPart = messageId.trim().slice(0, 8) || 'export'
  return `${slug}-${idPart}.pdf`
}

export async function exportBubbleMarkdownAsPdf(args: {
  markdown: string
  defaultFileName: string
  kind?: BubblePdfDocumentKind
}): Promise<{ savedPath: string | null; error?: string }> {
  const markdown = args.markdown.trim()
  if (!markdown) {
    return { savedPath: null, error: 'No content to export' }
  }
  const invoke = window.ipcRendererChannel?.ExportMarkdownAsPdf?.invoke
  if (!invoke) {
    return { savedPath: null, error: 'Export is unavailable in this environment' }
  }
  return invoke({
    markdown,
    defaultFileName: args.defaultFileName,
    kind: args.kind ?? 'default',
  })
}
