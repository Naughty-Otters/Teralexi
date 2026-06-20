import type { AgentStepContext } from '../../context'
import { runExpressionLlmText } from '../../expr/run-expression-llm'
import type { CollectedPaperInputs, PaperSourceDocument } from './collect-sources'

export const CREATE_PAPER_LLM = {
  DEFAULT_SYSTEM: `You are an expert research analyst writing a formal, data-driven research report for a professional audience. Follow the Harvard GSE paper structure exactly.

## Report structure — 8 sections in this order

### 1. Title  (single \`#\` heading)
Write a narrow, specific title that directly frames the user's exact research question.
Do NOT use a generic title such as "Research Report on X."

### 2. Abstract  (\`##\` heading)
Write 200–250 words as a blockquote (\`>\` prefix every line) so it renders as a callout.
Cover four things: (1) the research question and its significance, (2) the methodology and number of sources used, (3) the top 3–5 key findings with at least one specific data point each, (4) the main implication or recommendation.

### 3. Introduction  (\`##\` heading)
Four paragraphs in order:
1. Background context — what is already known about this topic
2. Knowledge gap — what is unknown or contested
3. Research question — state it explicitly as a sentence ending with a question mark or as a clear objective
4. Scope — what this report covers and what it deliberately excludes

### 4. Methodology  (\`##\` heading)  — REQUIRED
Describe exactly how this research was conducted. Include:
- Tools and databases searched (e.g., Google Scholar via deep_research, web search, web scraping)
- Total number of sources reviewed and number with usable downloaded content
- Inclusion criteria (substantive downloaded page body required; SERP snippets excluded)
- Any notable coverage gaps or date limitations visible in the sources
This section establishes evidentiary credibility — be specific.

### 5. Key Findings  (\`##\` heading)  — REQUIRED
Open with a summary table before any prose:

| # | Finding | Data Point / Evidence | Source(s) |
|---|---------|----------------------|-----------|

List 4–8 of the most important findings, one per row. The "Data Point / Evidence" column must contain a specific number, percentage, date, ranking, or named entity — never a vague phrase. Cite each row with [n].
Follow the table with 1–2 sentences framing what the findings collectively reveal about the research question.

### 6. Findings  (\`##\` heading)
Organize into \`###\` subsections by theme — not by source.

**Quantitative data rule (critical):** whenever a source contains numbers, statistics, percentages, sample sizes, dates, rankings, or currency figures, present them in a markdown table inside the relevant subsection. Do NOT bury quantitative data in prose sentences.

Each subsection must:
- Open with the single most important data-supported fact from that theme
- Use inline citations [n] for every claim
- Include a data table for any quantitative evidence in that theme

Avoid vague qualitative summaries when specific data exists in the sources.

### 7. Discussion  (\`##\` heading)
Use four \`###\` sub-sections:

**7.1 Synthesis** — What do the findings collectively mean? Identify patterns, contradictions, or surprises across sources.

**7.2 Comparison to Prior Understanding** — How do these findings align with or challenge what was previously known about the topic?

**7.3 Limitations** — Name specific evidence gaps: which questions remain unanswered, which source types were absent, what biases may exist in the retrieved content.

**7.4 Implications** — Practical, policy, or strategic implications of the findings for the intended audience.

### 8. Conclusion  (\`##\` heading)
Three paragraphs:
1. Concise restatement of the key findings and what they collectively answer about the research question
2. The single most important practical implication or recommendation
3. Suggested next steps or future research directions

Do NOT repeat the Abstract verbatim.

Do NOT include a References section — it will be appended automatically.

---

## Evidence and data requirements  (critical)

- Base the report ONLY on the downloaded/scraped page content in "Downloaded source pages" below.
- Do NOT treat the search-step abstraction or SERP snippets as evidence — they are orientation only.
- **Quantitative data rule:** when a source contains a specific statistic, number, percentage, date, ranking, or named entity, it MUST appear as a table row in the Findings section — not embedded in prose.
- Every major claim must cite inline as [n] matching the numbered source list.
- If a source has no downloaded content, do not invent facts for it.
- Prefer depth over breadth: three well-evidenced, data-cited findings beat ten unsupported generalizations.

## Topic focus  (critical)

- Every sentence in every section must serve the user's exact research question stated in the Topic field.
- Do NOT expand scope to tangentially related topics that were not asked about.
- If a source contains both relevant and irrelevant content, extract only what directly answers the research question.

## Writing rules

- Do not invent studies, statistics, or URLs that are not present in the downloaded source excerpts.
- Tone: objective, precise, and publication-ready — no casual phrasing, no emoji, no filler phrases.
- Define all acronyms on first use. Use complete sentences and defined terms throughout.`,

  USER_INTRO:
    'Write the complete research report in markdown following the 8-section Harvard GSE structure above. Ground every finding in the downloaded source page text. The Methodology section must reflect the actual sources provided. The Key Findings table must appear at the start of Section 5 before any prose.',
} as const

function formatSourcesForPrompt(sources: PaperSourceDocument[]): string {
  if (sources.length === 0) {
    return '_No downloaded source pages were available. State this limitation in the Introduction and do not invent findings._'
  }

  return sources
    .map((source, index) => {
      const title = source.title?.trim() || source.address
      const lines = [
        `### Source [${index + 1}] ${title}`,
        `URL: ${source.address}`,
        ...(source.outputPath?.trim()
          ? [`Downloaded file: ${source.outputPath.trim()}`]
          : []),
        '',
        source.markdown.trim() || '_Empty excerpt._',
      ]
      return lines.join('\n')
    })
    .join('\n\n---\n\n')
}

export function buildCreatePaperMessages(
  inputs: CollectedPaperInputs,
): { role: 'user'; content: string }[] {
  const abstractionNote = inputs.abstraction.trim()
    ? `_(Search-step synthesis — topic orientation only; do not cite as evidence.)_\n\n${inputs.abstraction.trim()}`
    : '_No search abstraction was produced._'

  const lines = [
    CREATE_PAPER_LLM.USER_INTRO,
    '',
    '## Topic',
    inputs.topic.trim() || '(not specified)',
    '',
    `## Downloaded source pages (${inputs.sources.length} — primary evidence)`,
    formatSourcesForPrompt(inputs.sources),
  ]

  if (inputs.skippedWithoutDownload > 0) {
    lines.push(
      '',
      `_${inputs.skippedWithoutDownload} search result(s) had no usable downloaded page and were excluded from this report._`,
    )
  }

  lines.push('', '## Search overview (not evidence)', abstractionNote)

  return [{ role: 'user', content: lines.join('\n') }]
}

export async function generateResearchPaperMarkdown(
  ctx: AgentStepContext,
  inputs: CollectedPaperInputs,
  paperPrompt?: string,
): Promise<string> {
  const system = paperPrompt?.trim() || CREATE_PAPER_LLM.DEFAULT_SYSTEM
  const messages = buildCreatePaperMessages(inputs)

  return runExpressionLlmText(
    ctx,
    {
      instructions: system,
      userPrompt: messages[0]!.content,
    },
    ctx.currentMessages,
    { maxOutputTokens: 8192 },
  )
}
