import type { AssistantStructuredContent, ResultSnapshotRef } from '../types'
import { isAssistantStructuredContent } from './structured-content'

export type { ResultSnapshotRef }

/** Embeds sandbox PDF snapshot metadata into structured assistant JSON. */
export function injectResultSnapshotIntoStructuredContent(
  structuredJson: string,
  snapshot: ResultSnapshotRef,
): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(structuredJson)
  } catch {
    return structuredJson
  }
  if (!isAssistantStructuredContent(parsed)) return structuredJson

  const content = parsed as AssistantStructuredContent
  const outer = content.assistantContent.outer
  outer.resultSnapshot = {
    pdfPath: snapshot.pdfPath,
    pdfUrl: snapshot.pdfUrl,
  }
  const paths = outer.allArtifactPaths ?? []
  if (!paths.includes(snapshot.pdfPath)) {
    outer.allArtifactPaths = [...paths, snapshot.pdfPath]
  }
  return JSON.stringify(content)
}
