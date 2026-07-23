/**
 * Scroll offset for a compact reasoning/thinking pane that should show the
 * latest lines (tail), not the first few words (head).
 */
export function compactPaneScrollTop(
  scrollHeight: number,
  clientHeight: number,
): number {
  return Math.max(0, scrollHeight - clientHeight)
}
