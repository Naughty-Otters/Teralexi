import { describe, expect, it } from 'vitest'
import {
  assignConversationToLeaf,
  closeLeaf,
  countLeaves,
  createLeaf,
  createSingleLeafLayout,
  findLeafByConversation,
  pruneMissingConversations,
  splitLeaf,
  visibleConversationIds,
} from './tree'
import type { PaneNode } from './types'

describe('conversation-layout tree', () => {
  it('creates a single-leaf layout', () => {
    const layout = createSingleLeafLayout('conv-a')
    expect(layout.root.type).toBe('leaf')
    expect(layout.root.conversationId).toBe('conv-a')
    expect(layout.focusedPaneId).toBe(layout.root.paneId)
  })

  it('splits right into a horizontal group and focuses the new leaf', () => {
    const layout = createSingleLeafLayout('conv-a')
    const result = splitLeaf(layout.root, layout.focusedPaneId, 'conv-b', 'right')
    expect(result).not.toBeNull()
    expect(result!.root.type).toBe('group')
    if (result!.root.type !== 'group') return
    expect(result!.root.orientation).toBe('horizontal')
    expect(result!.root.children[0].type).toBe('leaf')
    expect(result!.root.children[1].type).toBe('leaf')
    if (result!.root.children[1].type !== 'leaf') return
    expect(result!.root.children[1].conversationId).toBe('conv-b')
    expect(result!.newPaneId).toBe(result!.root.children[1].paneId)
    expect(countLeaves(result!.root)).toBe(2)
  })

  it('splits down into a vertical group', () => {
    const layout = createSingleLeafLayout('conv-a')
    const result = splitLeaf(layout.root, layout.focusedPaneId, 'conv-b', 'down')
    expect(result!.root.type).toBe('group')
    if (result!.root.type !== 'group') return
    expect(result!.root.orientation).toBe('vertical')
  })

  it('refuses to split past the max leaf count', () => {
    let root: PaneNode = createSingleLeafLayout('c1').root
    let focus = root.type === 'leaf' ? root.paneId : ''
    for (let i = 2; i <= 4; i++) {
      const result = splitLeaf(root, focus, `c${i}`, 'right')
      expect(result).not.toBeNull()
      root = result!.root
      focus = result!.newPaneId
    }
    expect(countLeaves(root)).toBe(4)
    expect(splitLeaf(root, focus, 'c5', 'right')).toBeNull()
  })

  it('refuses duplicate conversation ids on split', () => {
    const layout = createSingleLeafLayout('conv-a')
    expect(
      splitLeaf(layout.root, layout.focusedPaneId, 'conv-a', 'right'),
    ).toBeNull()
  })

  it('closes a leaf and promotes the sibling', () => {
    const layout = createSingleLeafLayout('conv-a')
    const split = splitLeaf(layout.root, layout.focusedPaneId, 'conv-b', 'right')!
    const newPaneId = split.newPaneId
    const closed = closeLeaf(split.root, newPaneId)
    expect(closed).not.toBeNull()
    expect(closed!.root.type).toBe('leaf')
    if (closed!.root.type !== 'leaf') return
    expect(closed!.root.conversationId).toBe('conv-a')
    expect(closed!.nextFocusedPaneId).toBe(closed!.root.paneId)
  })

  it('refuses closing the last leaf', () => {
    const layout = createSingleLeafLayout('conv-a')
    expect(closeLeaf(layout.root, layout.focusedPaneId)).toBeNull()
  })

  it('assigns a conversation to a leaf when unique', () => {
    const layout = createSingleLeafLayout('conv-a')
    const next = assignConversationToLeaf(
      layout.root,
      layout.focusedPaneId,
      'conv-b',
    )
    expect(next?.type).toBe('leaf')
    if (next?.type !== 'leaf') return
    expect(next.conversationId).toBe('conv-b')
  })

  it('blocks assigning a conversation already open in another pane', () => {
    const layout = createSingleLeafLayout('conv-a')
    const split = splitLeaf(layout.root, layout.focusedPaneId, 'conv-b', 'right')!
    const leftId =
      split.root.type === 'group' && split.root.children[0].type === 'leaf'
        ? split.root.children[0].paneId
        : ''
    expect(assignConversationToLeaf(split.root, leftId, 'conv-b')).toBeNull()
  })

  it('prunes missing conversations and collapses groups', () => {
    const a = createLeaf('conv-a')
    const b = createLeaf('conv-b')
    const root = {
      type: 'group' as const,
      orientation: 'horizontal' as const,
      ratio: 0.5,
      children: [a, b] as [typeof a, typeof b],
    }
    const pruned = pruneMissingConversations(root, new Set(['conv-a']))
    expect(pruned?.type).toBe('leaf')
    if (pruned?.type !== 'leaf') return
    expect(pruned.conversationId).toBe('conv-a')
  })

  it('lists visible conversation ids in leaf order', () => {
    const layout = createSingleLeafLayout('conv-a')
    const split = splitLeaf(layout.root, layout.focusedPaneId, 'conv-b', 'down')!
    expect(visibleConversationIds(split.root)).toEqual(['conv-a', 'conv-b'])
    expect(findLeafByConversation(split.root, 'conv-b')?.conversationId).toBe(
      'conv-b',
    )
  })
})
