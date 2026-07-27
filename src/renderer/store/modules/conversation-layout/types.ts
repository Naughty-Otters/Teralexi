/** Side-by-side panes (flex row). */
export type SplitOrientation = 'horizontal' | 'vertical'

export type PaneLeaf = {
  type: 'leaf'
  paneId: string
  conversationId: string
}

export type PaneGroup = {
  type: 'group'
  orientation: SplitOrientation
  /** First child size ratio in (0, 1); sibling gets the remainder. */
  ratio: number
  children: [PaneNode, PaneNode]
}

export type PaneNode = PaneLeaf | PaneGroup

export type ConversationPaneLayoutSnapshot = {
  version: 1
  focusedPaneId: string
  root: PaneNode
}

export type SplitDirection = 'right' | 'down'

export const MAX_CONVERSATION_PANES = 4

export const DEFAULT_SPLIT_RATIO = 0.5
