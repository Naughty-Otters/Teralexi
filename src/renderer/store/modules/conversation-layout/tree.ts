import { randomShortUuid } from '@shared/utils/short-uuid'
import {
  DEFAULT_SPLIT_RATIO,
  MAX_CONVERSATION_PANES,
  type PaneGroup,
  type PaneLeaf,
  type PaneNode,
  type SplitDirection,
  type SplitOrientation,
} from './types'

export function createPaneId(): string {
  return `pane-${randomShortUuid()}`
}

export function createLeaf(
  conversationId: string,
  paneId: string = createPaneId(),
): PaneLeaf {
  return {
    type: 'leaf',
    paneId,
    conversationId: conversationId.trim(),
  }
}

export function createSingleLeafLayout(conversationId: string): {
  root: PaneLeaf
  focusedPaneId: string
} {
  const leaf = createLeaf(conversationId)
  return { root: leaf, focusedPaneId: leaf.paneId }
}

export function cloneNode(node: PaneNode): PaneNode {
  if (node.type === 'leaf') {
    return { ...node }
  }
  return {
    type: 'group',
    orientation: node.orientation,
    ratio: node.ratio,
    children: [cloneNode(node.children[0]), cloneNode(node.children[1])],
  }
}

export function listLeaves(node: PaneNode): PaneLeaf[] {
  if (node.type === 'leaf') return [node]
  return [...listLeaves(node.children[0]), ...listLeaves(node.children[1])]
}

export function countLeaves(node: PaneNode): number {
  return listLeaves(node).length
}

export function findLeaf(
  node: PaneNode,
  paneId: string,
): PaneLeaf | null {
  if (node.type === 'leaf') {
    return node.paneId === paneId ? node : null
  }
  return (
    findLeaf(node.children[0], paneId) ?? findLeaf(node.children[1], paneId)
  )
}

export function findLeafByConversation(
  node: PaneNode,
  conversationId: string,
): PaneLeaf | null {
  const id = conversationId.trim()
  if (!id) return null
  for (const leaf of listLeaves(node)) {
    if (leaf.conversationId === id) return leaf
  }
  return null
}

export function visibleConversationIds(node: PaneNode): string[] {
  return listLeaves(node).map((leaf) => leaf.conversationId)
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO
  return Math.min(0.85, Math.max(0.15, ratio))
}

function orientationForDirection(direction: SplitDirection): SplitOrientation {
  // "Split right" → side-by-side (horizontal flex).
  // "Split down" → stacked (vertical flex).
  return direction === 'right' ? 'horizontal' : 'vertical'
}

/**
 * Replace the focused leaf with a group containing the original leaf and a
 * new sibling leaf. Returns null if the leaf is missing or the pane cap is hit.
 */
export function splitLeaf(
  root: PaneNode,
  focusedPaneId: string,
  newConversationId: string,
  direction: SplitDirection,
): { root: PaneNode; newPaneId: string } | null {
  if (countLeaves(root) >= MAX_CONVERSATION_PANES) return null
  if (findLeafByConversation(root, newConversationId)) return null

  const newLeaf = createLeaf(newConversationId)
  const orientation = orientationForDirection(direction)

  function replace(node: PaneNode): PaneNode | null {
    if (node.type === 'leaf') {
      if (node.paneId !== focusedPaneId) return null
      // New pane is the second child (right / below).
      const group: PaneGroup = {
        type: 'group',
        orientation,
        ratio: DEFAULT_SPLIT_RATIO,
        children: [node, newLeaf],
      }
      return group
    }
    const left = replace(node.children[0])
    if (left) {
      return {
        ...node,
        children: [left, node.children[1]],
      }
    }
    const right = replace(node.children[1])
    if (right) {
      return {
        ...node,
        children: [node.children[0], right],
      }
    }
    return null
  }

  const next = replace(root)
  if (!next) return null
  return { root: next, newPaneId: newLeaf.paneId }
}

/**
 * Remove a leaf and promote its sibling. Returns null if the leaf is the only
 * remaining pane or the pane id is unknown.
 */
export function closeLeaf(
  root: PaneNode,
  paneId: string,
): { root: PaneNode; nextFocusedPaneId: string } | null {
  if (root.type === 'leaf') {
    return null
  }

  function remove(node: PaneNode): {
    node: PaneNode | null
    promotedFocusId: string | null
    removed: boolean
  } {
    if (node.type === 'leaf') {
      if (node.paneId !== paneId) {
        return { node, promotedFocusId: null, removed: false }
      }
      return { node: null, promotedFocusId: null, removed: true }
    }

    const left = remove(node.children[0])
    if (left.removed) {
      if (!left.node) {
        // Left removed → promote right child.
        const survivor = node.children[1]
        const focus =
          survivor.type === 'leaf'
            ? survivor.paneId
            : listLeaves(survivor)[0]?.paneId ?? null
        return { node: survivor, promotedFocusId: focus, removed: true }
      }
      return {
        node: { ...node, children: [left.node, node.children[1]] },
        promotedFocusId: left.promotedFocusId,
        removed: true,
      }
    }

    const right = remove(node.children[1])
    if (right.removed) {
      if (!right.node) {
        const survivor = node.children[0]
        const focus =
          survivor.type === 'leaf'
            ? survivor.paneId
            : listLeaves(survivor)[0]?.paneId ?? null
        return { node: survivor, promotedFocusId: focus, removed: true }
      }
      return {
        node: { ...node, children: [node.children[0], right.node] },
        promotedFocusId: right.promotedFocusId,
        removed: true,
      }
    }

    return { node, promotedFocusId: null, removed: false }
  }

  const result = remove(root)
  if (!result.removed || !result.node || !result.promotedFocusId) return null
  return { root: result.node, nextFocusedPaneId: result.promotedFocusId }
}

export function assignConversationToLeaf(
  root: PaneNode,
  paneId: string,
  conversationId: string,
): PaneNode | null {
  const id = conversationId.trim()
  if (!id) return null
  const existing = findLeafByConversation(root, id)
  if (existing && existing.paneId !== paneId) return null

  function replace(node: PaneNode): PaneNode | null {
    if (node.type === 'leaf') {
      if (node.paneId !== paneId) return null
      return { ...node, conversationId: id }
    }
    const left = replace(node.children[0])
    if (left) {
      return { ...node, children: [left, node.children[1]] }
    }
    const right = replace(node.children[1])
    if (right) {
      return { ...node, children: [node.children[0], right] }
    }
    return null
  }

  return replace(root)
}

export function setGroupRatio(
  root: PaneNode,
  groupPath: number[],
  ratio: number,
): PaneNode | null {
  const nextRatio = clampRatio(ratio)

  function replace(node: PaneNode, path: number[]): PaneNode | null {
    if (path.length === 0) {
      if (node.type !== 'group') return null
      return { ...node, ratio: nextRatio }
    }
    if (node.type !== 'group') return null
    const index = path[0]
    if (index !== 0 && index !== 1) return null
    const child = replace(node.children[index], path.slice(1))
    if (!child) return null
    const children: [PaneNode, PaneNode] =
      index === 0
        ? [child, node.children[1]]
        : [node.children[0], child]
    return { ...node, children }
  }

  return replace(root, groupPath)
}

/**
 * Drop leaves whose conversation ids are missing. Collapse groups that lose a
 * child. Returns null if nothing remains.
 */
export function pruneMissingConversations(
  root: PaneNode,
  existingConversationIds: ReadonlySet<string>,
): PaneNode | null {
  function prune(node: PaneNode): PaneNode | null {
    if (node.type === 'leaf') {
      return existingConversationIds.has(node.conversationId) ? node : null
    }
    const left = prune(node.children[0])
    const right = prune(node.children[1])
    if (left && right) {
      return { ...node, children: [left, right] }
    }
    return left ?? right
  }

  return prune(root)
}

export function firstLeafPaneId(node: PaneNode): string | null {
  const leaves = listLeaves(node)
  return leaves[0]?.paneId ?? null
}
