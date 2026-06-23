import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { formatFinalResultHtmlBody } from '@shared/agent/assistant-external-reply'
import { parseAssistantStructuredContent } from '../utils/structured-content'
import { renderMarkdownToHtmlDocument } from './result-document-html'

export const FINAL_RESULT_FILENAME = 'final-result.html'

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
    body = formatFinalResultHtmlBody(parsed.assistantContent.outer)
  }
  if (!body.trim()) {
    body = 'No result content available.'
  }

  const html = renderMarkdownToHtmlDocument(body)
  await writeFile(resultFilePath, html, 'utf8')
  const resultsFileUrl = pathToFileURL(resultFilePath).href
  return { outputResultsDir, resultFilePath, resultsFileUrl }
}
