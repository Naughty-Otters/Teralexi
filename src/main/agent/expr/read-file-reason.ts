/** Gate-only field on `read_file` — stripped before the tool implementation runs. */
export const READ_FILE_REASON_FIELD = 'reason'

export function readFileReasonFromInput(input: unknown): string | undefined {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined
  }
  const reason = (input as Record<string, unknown>)[READ_FILE_REASON_FIELD]
  if (typeof reason !== 'string') return undefined
  const trimmed = reason.trim()
  return trimmed || undefined
}

export function stripReadFileReasonFromInput(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return input
  }
  const raw = input as Record<string, unknown>
  if (!(READ_FILE_REASON_FIELD in raw)) return input
  const { [READ_FILE_REASON_FIELD]: _reason, ...rest } = raw
  return rest
}
