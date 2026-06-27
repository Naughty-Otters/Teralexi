export const FIM_PREFIX = '<|fim_prefix|>'
export const FIM_SUFFIX = '<|fim_suffix|>'
export const FIM_MIDDLE = '<|fim_middle|>'

export const DEFAULT_FIM_STOP_TOKENS = [
  FIM_SUFFIX,
  FIM_PREFIX,
  FIM_MIDDLE,
  '<|file_sep|>',
  '<|repo_name|>',
  '<|fim_pad|>',
  '\n\n',
] as const

/** OpenAI-compatible /v1/completions APIs allow at most 4 stop sequences. */
export const OPENAI_COMPATIBLE_API_STOP_TOKENS = [
  FIM_SUFFIX,
  FIM_PREFIX,
  FIM_MIDDLE,
  '\n\n',
] as const

export function buildFimPrompt(prefix: string, suffix: string): string {
  return `${FIM_PREFIX}${prefix}${FIM_SUFFIX}${suffix}${FIM_MIDDLE}`
}

export function buildChatInfillPrompt(
  prefix: string,
  suffix: string,
  languageId: string,
): string {
  return [
    'Complete the code at the cursor. Return ONLY the text to insert.',
    'Do not repeat the prefix or suffix. No markdown fences or explanation.',
    `Language: ${languageId || 'plaintext'}`,
    '',
    'PREFIX (already typed):',
    prefix,
    '',
    'SUFFIX (already follows the cursor):',
    suffix,
    '',
    'INSERT:',
  ].join('\n')
}

export function isFimCapableModel(model: string): boolean {
  const normalized = model.trim().toLowerCase()
  if (!normalized) return false
  return (
    normalized.includes('coder') ||
    normalized.includes('codestral') ||
    normalized.includes('starcoder') ||
    normalized.includes('codeqwen') ||
    normalized.includes('deepseek-coder') ||
    normalized.includes('qwen2.5-coder') ||
    normalized.includes('qwen3-coder')
  )
}

export function extractFimContext(
  lines: string[],
  lineNumber: number,
  column: number,
  options?: { maxPrefixLines?: number; maxSuffixLines?: number },
): { prefix: string; suffix: string } {
  const maxPrefixLines = options?.maxPrefixLines ?? 25
  const maxSuffixLines = options?.maxSuffixLines ?? 25
  const lineIndex = Math.max(0, Math.min(lines.length - 1, lineNumber - 1))
  const currentLine = lines[lineIndex] ?? ''
  const safeColumn = Math.max(1, Math.min(column, currentLine.length + 1))

  const prefixStartLine = Math.max(0, lineIndex - maxPrefixLines + 1)
  const prefixLines = lines.slice(prefixStartLine, lineIndex)
  const prefixOnLine = currentLine.slice(0, safeColumn - 1)
  const prefix =
    prefixLines.length > 0
      ? `${prefixLines.join('\n')}\n${prefixOnLine}`
      : prefixOnLine

  const suffixEndLine = Math.min(lines.length - 1, lineIndex + maxSuffixLines)
  const suffixOnLine = currentLine.slice(safeColumn - 1)
  const suffixTail = lines.slice(lineIndex + 1, suffixEndLine + 1)
  const suffix =
    suffixTail.length > 0 ? `${suffixOnLine}\n${suffixTail.join('\n')}` : suffixOnLine

  return { prefix, suffix }
}

function stripAtStopToken(text: string, stopTokens: readonly string[]): string {
  let result = text
  for (const token of stopTokens) {
    const index = result.indexOf(token)
    if (index >= 0) {
      result = result.slice(0, index)
    }
  }
  return result
}

function trimSuffixOverlap(completion: string, suffix: string): string {
  if (!completion || !suffix) return completion

  const maxCheck = Math.min(completion.length, suffix.length)
  for (let overlap = maxCheck; overlap > 0; overlap -= 1) {
    if (completion.endsWith(suffix.slice(0, overlap))) {
      return completion.slice(0, completion.length - overlap)
    }
  }
  return completion
}

export function sanitizeFimCompletion(
  raw: string,
  suffix: string,
  stopTokens: readonly string[] = DEFAULT_FIM_STOP_TOKENS,
): string {
  const trimmed = raw.trimStart()
  const withoutStops = stripAtStopToken(trimmed, stopTokens)
  const withoutOverlap = trimSuffixOverlap(withoutStops, suffix)
  return withoutOverlap.replace(/\r\n/g, '\n')
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```[\w-]*\n([\s\S]*?)\n```$/)
  if (match?.[1] != null) return match[1]
  return trimmed
}

export function sanitizeChatInfillCompletion(raw: string, suffix: string): string {
  const withoutFence = stripMarkdownCodeFence(raw)
  return sanitizeFimCompletion(withoutFence, suffix, [])
}
