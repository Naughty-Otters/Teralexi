import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import MarkdownIt from 'markdown-it'
import { parseAssistantStructuredContent } from '../utils/structured-content'

export const FINAL_RESULT_FILENAME = 'final-result.html'

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
})

function buildHtmlDocument(bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sandbox Final Result</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0b1020;
        --panel: #121a2b;
        --panel-border: #25304a;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --code-bg: #0f172a;
        --accent: #60a5fa;
      }
      @media (prefers-color-scheme: light) {
        :root {
          --bg: #f8fafc;
          --panel: #ffffff;
          --panel-border: #dbe2ea;
          --text: #0f172a;
          --muted: #475569;
          --code-bg: #f1f5f9;
          --accent: #2563eb;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        font: 14px/1.6 Inter, ui-sans-serif, system-ui, sans-serif;
        color: var(--text);
        background: var(--bg);
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px 28px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
      }
      h1, h2, h3 { line-height: 1.25; }
      h1:first-child { margin-top: 0; }
      hr { border: 0; border-top: 1px solid var(--panel-border); margin: 24px 0; }
      a { color: var(--accent); }
      code, pre {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      code {
        padding: 0.12rem 0.35rem;
        border-radius: 6px;
        background: var(--code-bg);
      }
      pre {
        overflow: auto;
        padding: 14px 16px;
        border-radius: 10px;
        background: var(--code-bg);
      }
      pre code {
        padding: 0;
        background: transparent;
      }
      blockquote {
        margin-left: 0;
        padding-left: 14px;
        border-left: 3px solid var(--panel-border);
        color: var(--muted);
      }
      table {
        border-collapse: collapse;
        width: 100%;
      }
      th, td {
        border: 1px solid var(--panel-border);
        padding: 8px 10px;
        text-align: left;
      }
    </style>
  </head>
  <body>
    <main>
${bodyHtml}
    </main>
  </body>
</html>`
}

/**
 * Writes assistant structured JSON to `<sandbox>/output/results/final-result.html`.
 */
export async function writeFinalResultToSandbox(
  sandboxRoot: string,
  structuredAssistantJson: string,
): Promise<{
  outputResultsDir: string
  resultFilePath: string
  resultsFileUrl: string
}> {
  const outputResultsDir = join(sandboxRoot, 'output', 'results')
  await mkdir(outputResultsDir, { recursive: true })
  const resultFilePath = join(outputResultsDir, FINAL_RESULT_FILENAME)

  const parsed = parseAssistantStructuredContent(structuredAssistantJson)
  let body = ''
  if (parsed) {
    const outer = parsed.assistantContent.outer
    const parts: string[] = []
    if (outer.finalResult?.trim()) {
      parts.push(`# Final result\n\n${outer.finalResult.trim()}`)
    }
    if (outer.report?.trim()) {
      parts.push(`# Report\n\n${outer.report.trim()}`)
    }
    const research = outer.researchReport
    if (research) {
      const researchLines = [
        '# Research report',
        research.topic?.trim() ? `**Topic:** ${research.topic.trim()}` : '',
        Number.isFinite(research.sourceCount)
          ? `**Sources:** ${research.sourceCount}`
          : '',
        research.paperExcerpt?.trim() ?? '',
        research.pdfPath?.trim()
          ? `**PDF:** \`${research.pdfPath.trim()}\``
          : '',
      ].filter((line) => line.length > 0)
      parts.push(researchLines.join('\n\n'))
    }
    const captures = outer.stepCaptures
    if (captures?.length) {
      const capLines = captures.map((c) => {
        const paths =
          c.outputPaths?.filter(Boolean).length > 0
            ? `\n\n**Paths:**\n${c.outputPaths.map((p) => `- \`${p}\``).join('\n')}`
            : ''
        return `### ${c.title}\n\n${c.content.trim()}${paths}`
      })
      parts.push(`# Step outputs\n\n${capLines.join('\n\n---\n\n')}`)
    }
    if (outer.allArtifactPaths?.length) {
      parts.push(
        `# Artifact index\n\n${outer.allArtifactPaths.map((p) => `- \`${p}\``).join('\n')}`,
      )
    }
    body = parts.join('\n\n---\n\n')
  }
  if (!body.trim()) {
    body = `# Raw assistant output\n\n\`\`\`json\n${structuredAssistantJson.slice(0, 100_000)}\n\`\`\`\n`
  }

  const html = buildHtmlDocument(markdown.render(body))
  await writeFile(resultFilePath, html, 'utf8')
  const resultsFileUrl = pathToFileURL(resultFilePath).href
  return { outputResultsDir, resultFilePath, resultsFileUrl }
}
