import {
  LAYOUT_PREF_KEYS,
  readStoredString,
  writeStoredString,
} from '@renderer/lib/layout-preferences'
import type {
  ConversationPaneLayoutSnapshot,
  PaneGroup,
  PaneLeaf,
  PaneNode,
  SplitOrientation,
} from './types'
import { DEFAULT_SPLIT_RATIO } from './types'

function isOrientation(value: unknown): value is SplitOrientation {
  return value === 'horizontal' || value === 'vertical'
}

function normalizeLeaf(value: unknown): PaneLeaf | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.type !== 'leaf') return null
  const paneId =
    typeof record.paneId === 'string' ? record.paneId.trim() : ''
  const conversationId =
    typeof record.conversationId === 'string'
      ? record.conversationId.trim()
      : ''
  if (!paneId || !conversationId) return null
  return { type: 'leaf', paneId, conversationId }
}

function normalizeNode(value: unknown): PaneNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.type === 'leaf') return normalizeLeaf(value)
  if (record.type !== 'group') return null
  if (!isOrientation(record.orientation)) return null
  const ratio =
    typeof record.ratio === 'number' && Number.isFinite(record.ratio)
      ? Math.min(0.85, Math.max(0.15, record.ratio))
      : DEFAULT_SPLIT_RATIO
  if (!Array.isArray(record.children) || record.children.length !== 2) {
    return null
  }
  const left = normalizeNode(record.children[0])
  const right = normalizeNode(record.children[1])
  if (!left || !right) return null
  const group: PaneGroup = {
    type: 'group',
    orientation: record.orientation,
    ratio,
    children: [left, right],
  }
  return group
}

export function normalizeLayoutSnapshot(
  value: unknown,
): ConversationPaneLayoutSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.version !== 1) return null
  const focusedPaneId =
    typeof record.focusedPaneId === 'string'
      ? record.focusedPaneId.trim()
      : ''
  const root = normalizeNode(record.root)
  if (!focusedPaneId || !root) return null
  return { version: 1, focusedPaneId, root }
}

export function readLayoutSnapshot(): ConversationPaneLayoutSnapshot | null {
  try {
    const raw = readStoredString(LAYOUT_PREF_KEYS.conversationPaneLayout)
    if (!raw) return null
    return normalizeLayoutSnapshot(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function writeLayoutSnapshot(
  snapshot: ConversationPaneLayoutSnapshot,
): void {
  writeStoredString(
    LAYOUT_PREF_KEYS.conversationPaneLayout,
    JSON.stringify(snapshot),
  )
}

export function clearLayoutSnapshot(): void {
  writeStoredString(LAYOUT_PREF_KEYS.conversationPaneLayout, null)
}
