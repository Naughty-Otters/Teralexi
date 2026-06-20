import type { ResearchFinding } from './config'

/** Markdown digest of research findings for step progress and downstream context. */
export function formatResearchFindingsMarkdown(
  topic: string,
  findings: ResearchFinding[],
): string {
  const title = topic.trim() || '(topic)'
  const lines = [`# Research: ${title}`, '']

  if (findings.length === 0) {
    lines.push('_No findings recorded._')
    return lines.join('\n')
  }

  for (const finding of findings) {
    lines.push(`- ${finding.question}`, '')
    lines.push(finding.output.trim() || '_No substantive output recorded._', '')
  }

  return lines.join('\n').trim()
}
