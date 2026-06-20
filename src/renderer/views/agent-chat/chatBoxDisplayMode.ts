/** How assistant pipeline output is shown in the chat panel. */
export type ChatBoxDisplayMode = 'brief' | 'timeline' | 'conversation'

/**
 * When true, the UI always uses conversation mode and hides the mode toggle.
 * Brief/timeline mode code remains for tests and future re-enable.
 */
export const UI_CHAT_CONVERSATION_MODE_ONLY = true

export const CHAT_BOX_DISPLAY_MODE_STORAGE_KEY = 'otter:chatBoxDisplayMode'

/** @deprecated Migrated to {@link CHAT_BOX_DISPLAY_MODE_STORAGE_KEY}. */
export const ASSISTANT_STRUCTURED_DEBUG_STORAGE_KEY = 'otter:assistantStructuredDebug'

const MODES: readonly ChatBoxDisplayMode[] = [
  'brief',
  'timeline',
  'conversation',
]

export function isChatBoxDisplayMode(value: string): value is ChatBoxDisplayMode {
  return (MODES as readonly string[]).includes(value)
}

export function isUiChatBoxDisplayModeToggleEnabled(): boolean {
  return !UI_CHAT_CONVERSATION_MODE_ONLY
}

/** Effective mode for the chat panel (respects {@link UI_CHAT_CONVERSATION_MODE_ONLY}). */
export function resolveUiChatBoxDisplayMode(): ChatBoxDisplayMode {
  if (UI_CHAT_CONVERSATION_MODE_ONLY) return 'conversation'
  return readChatBoxDisplayModeInitial()
}

/** Brief = latest step only; legacy debug on → timeline; off → brief. */
export function readChatBoxDisplayModeInitial(): ChatBoxDisplayMode {
  try {
    const stored = localStorage.getItem(CHAT_BOX_DISPLAY_MODE_STORAGE_KEY)
    if (stored && isChatBoxDisplayMode(stored)) return stored

    const legacy = localStorage.getItem(ASSISTANT_STRUCTURED_DEBUG_STORAGE_KEY)
    if (legacy === '0') return 'brief'
    if (legacy === '1') return 'timeline'
    return 'brief'
  } catch {
    return 'brief'
  }
}

export function persistChatBoxDisplayMode(mode: ChatBoxDisplayMode): void {
  try {
    localStorage.setItem(CHAT_BOX_DISPLAY_MODE_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function cycleChatBoxDisplayMode(
  current: ChatBoxDisplayMode,
): ChatBoxDisplayMode {
  const index = MODES.indexOf(current)
  const next = MODES[(index + 1) % MODES.length]
  return next ?? 'brief'
}

export function chatBoxDisplayModeLabel(mode: ChatBoxDisplayMode): string {
  switch (mode) {
    case 'brief':
      return 'Brief'
    case 'timeline':
      return 'Timeline'
    case 'conversation':
      return 'Conversation'
  }
}

export function chatBoxDisplayModeDescription(mode: ChatBoxDisplayMode): string {
  switch (mode) {
    case 'brief':
      return 'Show only the latest pipeline step while the agent runs'
    case 'timeline':
      return 'Timeline of steps with expandable sections'
    case 'conversation':
      return 'Each pipeline step in its own chat bubble'
  }
}

export function chatBoxDisplayModeIcon(mode: ChatBoxDisplayMode): string {
  switch (mode) {
    case 'brief':
      return 'i-lucide-message-square'
    case 'timeline':
      return 'i-lucide-list-tree'
    case 'conversation':
      return 'i-lucide-messages-square'
  }
}

/** Structured JSON / step-progress layout (timeline or conversation), not compact brief. */
export function usesStructuredAssistantRendering(mode: ChatBoxDisplayMode): boolean {
  return mode !== 'brief'
}
