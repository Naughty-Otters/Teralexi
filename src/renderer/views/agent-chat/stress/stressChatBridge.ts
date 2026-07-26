/**
 * Bridge so StressTestRunner can drive the live ChatPanel (UI FPS + real send path).
 */

export type StressChatSendResult = {
  ok: boolean
  error?: string
  hitlPaused?: boolean
  assistantText?: string
  /** User/stress-runner requested stop; not a turn failure. */
  aborted?: boolean
}

export type StressSendOptions = {
  isAborted?: () => boolean
  /** Target conversation (required for concurrent multi-chat sends). */
  conversationId?: string
}

export type StressChatDriver = {
  /** True when a Chat instance is mounted for the current conversation. */
  isReady: () => boolean
  /** Send a user message and wait until the stream returns to idle. */
  sendAndWait: (
    text: string,
    opts?: StressSendOptions,
  ) => Promise<StressChatSendResult>
  /** Abort the in-flight Chat SDK turn for the focused conversation (no-op if idle). */
  stopCurrentTurn: () => void
  /** Abort a specific conversation's in-flight turn. */
  stopConversation: (conversationId: string) => void
}

let driver: StressChatDriver | null = null
/** Switch right panel to chat so ChatPanel mounts (settings unmounts it). */
let requestChatView: (() => void) | null = null

export function registerStressChatDriver(next: StressChatDriver | null): void {
  driver = next
}

export function getStressChatDriver(): StressChatDriver | null {
  return driver
}

export function registerStressChatViewOpener(opener: (() => void) | null): void {
  requestChatView = opener
}

/** Ensure ChatPanel is visible/mounted before waiting on the driver. */
export function ensureStressChatView(): void {
  requestChatView?.()
}

export type WaitForStressChatOptions = {
  isAborted?: () => boolean
  /**
   * When true, switch to chat once. Do not keep re-forcing chat — that fights
   * the user opening Settings to hit Stop.
   */
  openView?: boolean
}

/**
 * Wait until the ChatPanel driver is mounted.
 * @param timeoutMs Use 0 (or negative) to wait indefinitely until ready or aborted.
 */
export async function waitForStressChatReady(
  timeoutMs = 15_000,
  opts?: WaitForStressChatOptions,
): Promise<StressChatDriver> {
  if (opts?.openView) ensureStressChatView()
  const start = Date.now()
  const hasDeadline = timeoutMs > 0
  while (true) {
    if (opts?.isAborted?.()) {
      throw new Error('Stress test stopped')
    }
    const d = driver
    if (d?.isReady()) return d
    if (hasDeadline && Date.now() - start >= timeoutMs) {
      throw new Error('Chat panel not ready for stress test')
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}
