import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseToolFileChanges } from '@shared/file-change/parse-tool-file-changes'
import { stripTerminalCaptureHeaders } from '@shared/tool-result/terminal-capture'

const EMPTY_CAPTURE_MARKERS = new Set([
  '(no stdout/stderr)',
  '(no output)',
])

const MAX_HYDRATE_BYTES_PER_FILE = 32 * 1024
const MAX_HYDRATE_FILES = 4
const MAX_HYDRATE_TOTAL_CHARS = 48 * 1024

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isMeaningfulText(text: string | undefined): boolean {
  if (!text) return false
  const trimmed = stripTerminalCaptureHeaders(text).trim()
  if (!trimmed) return false
  if (EMPTY_CAPTURE_MARKERS.has(trimmed.toLowerCase())) return false
  return true
}

function resolveReadablePath(
  rawPath: string,
  sandboxRoot?: string,
): string | null {
  const trimmed = rawPath.trim()
  if (!trimmed) return null
  if (path.isAbsolute(trimmed)) return trimmed
  if (sandboxRoot?.trim()) {
    return path.resolve(sandboxRoot.trim(), trimmed)
  }
  return null
}

async function readTextPreview(absPath: string, maxBytes: number): Promise<string | null> {
  try {
    const st = await stat(absPath)
    if (!st.isFile()) return null
    const buf = await readFile(absPath)
    const slice = buf.subarray(0, Math.min(buf.length, maxBytes))
    const text = slice.toString('utf8')
    const truncated = buf.length > maxBytes
    return truncated ? `${text}\n…[file truncated]` : text
  } catch {
    return null
  }
}

function collectOutputPaths(
  record: Record<string, unknown>,
  sandboxRoot?: string,
): string[] {
  const paths: string[] = []
  const seen = new Set<string>()

  const push = (raw: unknown) => {
    if (typeof raw !== 'string' || !raw.trim()) return
    const abs = resolveReadablePath(raw, sandboxRoot)
    if (!abs) return
    const key = abs.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    paths.push(abs)
  }

  for (const change of parseToolFileChanges(record)) {
    if (typeof change.path === 'string') {
      push(change.path)
    }
  }

  push(record.path)

  const filesField = record.files
  if (Array.isArray(filesField)) {
    for (const entry of filesField) {
      const row = asRecord(entry)
      if (row) push(row.path)
    }
  }

  push(record.captureAbsolutePath)
  push(record.resultReadFrom)

  const artifactsField = record.artifacts
  if (Array.isArray(artifactsField)) {
    for (const row of artifactsField) {
      const a = asRecord(row)
      if (!a || a.role === 'script' || a.role === 'capture') continue
      if (typeof a.path === 'string') push(a.path)
    }
  }

  if (typeof record.from === 'string') push(record.from)
  if (typeof record.to === 'string') push(record.to)

  return paths
}

/**
 * When a tool wrote files but stdout/capture is empty, read output files into
 * `resultContent` so the model, UI, and verifier see real payload.
 */
export async function hydrateToolResultFromOutputFiles(
  _toolName: string,
  result: unknown,
  sandboxRoot?: string,
): Promise<unknown> {
  const record = asRecord(result)
  if (!record) return result

  if (
    isMeaningfulText(
      typeof record.resultContent === 'string' ? record.resultContent : undefined,
    ) ||
    isMeaningfulText(typeof record.output === 'string' ? record.output : undefined)
  ) {
    return result
  }

  const resolvedRoot =
    typeof record.sandboxRoot === 'string' && record.sandboxRoot.trim()
      ? record.sandboxRoot.trim()
      : sandboxRoot
  const paths = collectOutputPaths(record, resolvedRoot)
  if (paths.length === 0) return result

  const blocks: string[] = []
  let totalChars = 0

  for (const abs of paths.slice(0, MAX_HYDRATE_FILES)) {
    if (totalChars >= MAX_HYDRATE_TOTAL_CHARS) break
    const remaining = MAX_HYDRATE_TOTAL_CHARS - totalChars
    const perFile = Math.min(MAX_HYDRATE_BYTES_PER_FILE, remaining)
    const preview = await readTextPreview(abs, perFile)
    if (!preview?.trim()) continue
    const label = path.basename(abs)
    const block = `--- ${label} ---\n${preview.trim()}`
    blocks.push(block)
    totalChars += block.length
  }

  if (blocks.length === 0) return result

  const hydrated = blocks.join('\n\n')
  const next: Record<string, unknown> = { ...record, resultContent: hydrated }

  if (
    !isMeaningfulText(typeof record.output === 'string' ? record.output : undefined)
  ) {
    next.output = hydrated
  }

  return next
}
