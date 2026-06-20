import { basename } from 'node:path'
import type { CollectedPaperInputs } from './collect-sources'

const PAPER_PREVIEW_MAX_CHARS = 2_400

export function formatCreatePaperProgress(
  inputs: CollectedPaperInputs,
  outputPath: string,
): string {
  const file = basename(outputPath) || outputPath
  return [
    `\n📄 Research report ready`,
    `Topic: ${inputs.topic || '(none)'}`,
    `Sources used: ${inputs.sources.length}`,
    `Saved: ${file}`,
    '',
  ].join('\n')
}

function truncatePaperPreview(markdown: string): string {
  const trimmed = markdown.trim()
  if (!trimmed) return '_Empty report._'
  if (trimmed.length <= PAPER_PREVIEW_MAX_CHARS) return trimmed
  return `${trimmed.slice(0, PAPER_PREVIEW_MAX_CHARS - 1)}…`
}

/**
 * Markdown shown in chat bubbles, pipeline persistence, and downstream summary/report context.
 * Includes a readable excerpt of the paper (full text is in the PDF).
 */
export function formatCreatePaperDigest(input: {
  topic: string
  abstraction: string
  sourceCount: number
  outputPath: string
  paperMarkdown: string
}): string {
  const file = basename(input.outputPath) || input.outputPath
  const preview = truncatePaperPreview(input.paperMarkdown)

  const sections = [
    `# Research report: ${input.topic.trim() || '(topic)'}`,
    '',
    `**Downloaded sources used:** ${input.sourceCount}`,
    `**Full report (PDF):** \`${file}\``,
    '',
    '## Report (from downloaded pages)',
    '',
    preview,
  ]

  if (input.abstraction.trim()) {
    sections.push(
      '',
      '## Search overview (not used as report body)',
      '',
      input.abstraction.trim(),
    )
  }

  return sections.join('\n')
}

/** @deprecated Use {@link formatCreatePaperDigest} with paperMarkdown. */
export function formatResearchReportBubbleBody(input: {
  topic: string
  sourceCount: number
  outputPath: string
  abstraction?: string
  paperMarkdown?: string
}): string {
  return formatCreatePaperDigest({
    topic: input.topic,
    abstraction: input.abstraction ?? '',
    sourceCount: input.sourceCount,
    outputPath: input.outputPath,
    paperMarkdown: input.paperMarkdown ?? '',
  })
}
