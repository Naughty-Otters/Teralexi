import {
  classifyConversationToolViewer,
  type ConversationToolResponseViewer,
} from './conversationToolResponseModel'

/** Max tool rows mounted in the tool-loop sub-panel (latest kept). */
export const TOOL_LOOP_PANEL_MAX_ITEMS = 10

/** Diff lines shown in Cursor-style file update boxes (collapsed / brief). */
export const TOOL_LOOP_BRIEF_DIFF_LINES = 5

export function visibleToolLoopPanelItems<T>(
  items: readonly T[],
  maxItems: number = TOOL_LOOP_PANEL_MAX_ITEMS,
): { visible: readonly T[]; droppedCount: number } {
  if (items.length <= maxItems) {
    return { visible: items, droppedCount: 0 }
  }
  return {
    visible: items.slice(-maxItems),
    droppedCount: items.length - maxItems,
  }
}

/** Rich expandable viewer for a completed tool row; null while still running. */
export function toolLoopPanelItemViewer(
  part: unknown,
  isRunning: boolean,
): ConversationToolResponseViewer | null {
  if (isRunning) return null
  return classifyConversationToolViewer(part)
}
