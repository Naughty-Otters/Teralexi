/** Remove capture-file banners from command / run_script output. */
export function stripTerminalCaptureHeaders(text: string): string {
  return text
    .replace(/^--- stdout ---\n?/gm, '')
    .replace(/^--- stderr ---\n?/gm, '')
    .trim()
}

/** Standard combined stdout/stderr block for command tools. */
export function formatCommandOutput(stdout: string, stderr: string): string {
  const parts: string[] = []
  if (stdout.trim()) parts.push('--- stdout ---\n' + stdout.trimEnd())
  if (stderr.trim()) parts.push('--- stderr ---\n' + stderr.trimEnd())
  return parts.join('\n\n').trim()
}

/** Attach `output` and `resultContent` to command tool results. */
export function stampCommandToolResult<T extends Record<string, unknown>>(
  result: T,
): T & { output: string; resultContent: string } {
  const stdout = typeof result.stdout === 'string' ? result.stdout : ''
  const stderr = typeof result.stderr === 'string' ? result.stderr : ''
  const output = formatCommandOutput(stdout, stderr)
  const existing =
    typeof result.resultContent === 'string'
      ? stripTerminalCaptureHeaders(result.resultContent)
      : ''
  const resultContent = output.trim() || existing.trim()
  if (!resultContent) return result
  return { ...result, output, resultContent }
}
