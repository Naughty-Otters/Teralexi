import { ref, type Ref } from 'vue'

import { recordUiFlush } from './chatUiPerf'

export type FlushPriority = 'normal' | 'immediate'
/** Logical flush kind; stored keys are namespaced per conversation. */
export type FlushKey = 'snapshot' | 'messages-sync' | 'scroll' | 'store-sync'

export type ScheduleUiFlushOptions = {
  priority?: FlushPriority
  conversationId?: string
  /** When set, normal flushes skip non-visible conversations unless `force` is true. */
  visibleConversationId?: string | null
  force?: boolean
}

type PendingJob = {
  kind: FlushKey
  fn: () => void
  priority: FlushPriority
  conversationId?: string
  force?: boolean
}

const BACKLOG_FAST_FORWARD_THRESHOLD = 100
const NORMAL_MIN_INTERVAL_MS = 32
const BACKLOG_MIN_INTERVAL_MS = 64
const GLOBAL_FLUSH_NAMESPACE = '_'

const pendingByKey = new Map<string, PendingJob>()
const ingressBacklogByConversation = new Map<string, number>()
const catchingUpByConversation = new Map<string, Ref<boolean>>()

/** Focused conversation — used for backpressure interval sampling. */
let visibleConversationId: string | null = null
/** All on-screen pane conversations (includes focused). */
let visibleConversationIds = new Set<string>()
let rafHandle: number | null = null
let timeoutHandle: number | null = null
let lastNormalFlushAt = 0

function currentMinFlushIntervalMs(): number {
  if (!visibleConversationId) return NORMAL_MIN_INTERVAL_MS
  const backlog = ingressBacklogByConversation.get(visibleConversationId) ?? 0
  return backlog > BACKLOG_FAST_FORWARD_THRESHOLD
    ? BACKLOG_MIN_INTERVAL_MS
    : NORMAL_MIN_INTERVAL_MS
}

function isVisibleConversation(conversationId: string): boolean {
  if (visibleConversationIds.size === 0) {
    // Legacy / unset: treat focused-only visibility, or allow all when unset.
    if (!visibleConversationId) return true
    return conversationId === visibleConversationId
  }
  return visibleConversationIds.has(conversationId)
}

type RafFn = (cb: FrameRequestCallback) => number
type CancelRafFn = (id: number) => void
type TimeoutFn = (cb: () => void, ms: number) => number
type ClearTimeoutFn = (id: number) => void
type MicrotaskFn = (cb: () => void) => void

let scheduleRaf: RafFn =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number

let cancelRaf: CancelRafFn =
  typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : (id) => clearTimeout(id)

let scheduleTimeout: TimeoutFn = (cb, ms) =>
  setTimeout(cb, ms) as unknown as number

let clearTimeoutFn: ClearTimeoutFn = (id) => {
  clearTimeout(id)
}

let scheduleMicrotask: MicrotaskFn = (cb) => queueMicrotask(cb)

/** `conversationId::kind` so concurrent conversations do not overwrite each other. */
export function namespacedFlushKey(
  kind: FlushKey,
  conversationId?: string,
): string {
  const cid = conversationId?.trim() || GLOBAL_FLUSH_NAMESPACE
  return `${cid}::${kind}`
}

/** Test hook: replace rAF / timeout / microtask schedulers. */
export function setChatUiFlushSchedulers(opts: {
  raf?: RafFn
  cancelRaf?: CancelRafFn
  timeout?: TimeoutFn
  clearTimeout?: ClearTimeoutFn
  microtask?: MicrotaskFn
}): void {
  if (opts.raf) scheduleRaf = opts.raf
  if (opts.cancelRaf) cancelRaf = opts.cancelRaf
  if (opts.timeout) scheduleTimeout = opts.timeout
  if (opts.clearTimeout) clearTimeoutFn = opts.clearTimeout
  if (opts.microtask) scheduleMicrotask = opts.microtask
}

export function setVisibleConversationForUiFlush(
  conversationId: string | null,
): void {
  visibleConversationId = conversationId?.trim() || null
  if (visibleConversationId) {
    visibleConversationIds = new Set([visibleConversationId])
  } else {
    visibleConversationIds = new Set()
  }
}

/**
 * Mark all on-screen pane conversations as visible for UI flushes.
 * `focusedConversationId` remains the backpressure sampling target.
 */
export function setVisibleConversationIdsForUiFlush(
  conversationIds: readonly string[],
  focusedConversationId?: string | null,
): void {
  const next = new Set<string>()
  for (const raw of conversationIds) {
    const id = raw?.trim()
    if (id) next.add(id)
  }
  visibleConversationIds = next
  const focused = focusedConversationId?.trim() || null
  if (focused && next.has(focused)) {
    visibleConversationId = focused
  } else {
    visibleConversationId = next.values().next().value ?? null
  }
}

export function getVisibleConversationIdsForUiFlush(): string[] {
  if (visibleConversationIds.size > 0) return [...visibleConversationIds]
  return visibleConversationId ? [visibleConversationId] : []
}

function shouldRunJob(job: PendingJob): boolean {
  if (job.force) return true
  const cid = job.conversationId?.trim()
  if (!cid) return true
  if (job.priority === 'immediate') return true
  return isVisibleConversation(cid)
}

function getCatchingUpRef(conversationId: string): Ref<boolean> {
  const key = conversationId.trim()
  let existing = catchingUpByConversation.get(key)
  if (!existing) {
    existing = ref(false)
    catchingUpByConversation.set(key, existing)
  }
  return existing
}

export function conversationIsCatchingUp(conversationId: string): Ref<boolean> {
  return getCatchingUpRef(conversationId)
}

export function recordIngressChunkForBackpressure(conversationId: string): void {
  const key = conversationId.trim()
  if (!key) return
  const next = (ingressBacklogByConversation.get(key) ?? 0) + 1
  ingressBacklogByConversation.set(key, next)
  if (next > BACKLOG_FAST_FORWARD_THRESHOLD) {
    getCatchingUpRef(key).value = true
  }
}

function drainIngressBacklog(conversationId: string): void {
  const key = conversationId.trim()
  if (!key) return
  ingressBacklogByConversation.set(key, 0)
  getCatchingUpRef(key).value = false
}

function runPendingJob(mapKey: string, job: PendingJob): void {
  if (!shouldRunJob(job)) return
  recordUiFlush()
  job.fn()
  if (job.conversationId) {
    drainIngressBacklog(job.conversationId)
  }
  pendingByKey.delete(mapKey)
}

function clearScheduledWake(): void {
  if (rafHandle != null) {
    cancelRaf(rafHandle)
    rafHandle = null
  }
  if (timeoutHandle != null) {
    clearTimeoutFn(timeoutHandle)
    timeoutHandle = null
  }
}

function wakeOnAnimationFrame(): void {
  if (rafHandle != null) return
  rafHandle = scheduleRaf(() => {
    rafHandle = null
    flushNormalJobs()
  })
}

/**
 * If still inside the min interval, sleep with setTimeout for the remainder
 * instead of spinning empty rAFs every display frame.
 */
function scheduleWakeAfterInterval(minIntervalMs: number, now: number): void {
  if (timeoutHandle != null || rafHandle != null) return
  const wait = Math.max(1, minIntervalMs - (now - lastNormalFlushAt))
  timeoutHandle = scheduleTimeout(() => {
    timeoutHandle = null
    wakeOnAnimationFrame()
  }, wait)
}

function flushNormalJobs(): void {
  const now = performance.now()
  const minInterval = currentMinFlushIntervalMs()
  if (now - lastNormalFlushAt < minInterval) {
    scheduleWakeAfterInterval(minInterval, now)
    return
  }
  lastNormalFlushAt = now

  for (const [key, job] of [...pendingByKey.entries()]) {
    if (job.priority !== 'normal') continue
    runPendingJob(key, job)
  }
}

function scheduleNormalFlush(): void {
  if (rafHandle != null || timeoutHandle != null) return
  const now = performance.now()
  const minInterval = currentMinFlushIntervalMs()
  if (lastNormalFlushAt > 0 && now - lastNormalFlushAt < minInterval) {
    scheduleWakeAfterInterval(minInterval, now)
    return
  }
  wakeOnAnimationFrame()
}

/**
 * Coalesce UI-side work to rAF (normal) or microtask (immediate).
 * Latest callback per namespaced `conversationId::kind` wins.
 */
export function scheduleUiFlush(
  kind: FlushKey,
  fn: () => void,
  options: ScheduleUiFlushOptions = {},
): void {
  const priority = options.priority ?? 'normal'
  const conversationId = options.conversationId?.trim() || undefined
  const mapKey = namespacedFlushKey(kind, conversationId)
  const job: PendingJob = {
    kind,
    fn,
    priority,
    conversationId,
    force: options.force,
  }

  if (options.visibleConversationId !== undefined) {
    setVisibleConversationForUiFlush(options.visibleConversationId)
  }

  pendingByKey.set(mapKey, job)

  if (priority === 'immediate') {
    runPendingJob(mapKey, job)
    return
  }

  scheduleNormalFlush()
}

/** Run all pending flushes for a conversation (e.g. stream end / switch). */
export function flushAllUiForConversation(conversationId: string): void {
  const key = conversationId.trim()
  if (!key) return
  const prefix = `${key}::`

  for (const [flushKey, job] of [...pendingByKey.entries()]) {
    if (!flushKey.startsWith(prefix) && job.conversationId !== key) continue
    runPendingJob(flushKey, { ...job, force: true })
  }
  drainIngressBacklog(key)
}

export function resetChatUiFlushState(): void {
  pendingByKey.clear()
  ingressBacklogByConversation.clear()
  catchingUpByConversation.clear()
  visibleConversationId = null
  visibleConversationIds = new Set()
  clearScheduledWake()
  lastNormalFlushAt = 0
}