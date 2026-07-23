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
const GLOBAL_FLUSH_NAMESPACE = '_'

const pendingByKey = new Map<string, PendingJob>()
const ingressBacklogByConversation = new Map<string, number>()
const catchingUpByConversation = new Map<string, Ref<boolean>>()

let visibleConversationId: string | null = null
let rafHandle: number | null = null
let lastNormalFlushAt = 0

type RafFn = (cb: FrameRequestCallback) => number
type MicrotaskFn = (cb: () => void) => void

let scheduleRaf: RafFn =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number

let scheduleMicrotask: MicrotaskFn = (cb) => queueMicrotask(cb)

/** `conversationId::kind` so concurrent conversations do not overwrite each other. */
export function namespacedFlushKey(
  kind: FlushKey,
  conversationId?: string,
): string {
  const cid = conversationId?.trim() || GLOBAL_FLUSH_NAMESPACE
  return `${cid}::${kind}`
}

/** Test hook: replace rAF / microtask schedulers. */
export function setChatUiFlushSchedulers(opts: {
  raf?: RafFn
  microtask?: MicrotaskFn
}): void {
  if (opts.raf) scheduleRaf = opts.raf
  if (opts.microtask) scheduleMicrotask = opts.microtask
}

export function setVisibleConversationForUiFlush(
  conversationId: string | null,
): void {
  visibleConversationId = conversationId?.trim() || null
}

function shouldRunJob(job: PendingJob): boolean {
  if (job.force) return true
  const cid = job.conversationId?.trim()
  if (!cid) return true
  if (!visibleConversationId) return true
  if (job.priority === 'immediate') return true
  return cid === visibleConversationId
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

function flushNormalJobs(): void {
  rafHandle = null
  const now = performance.now()
  if (now - lastNormalFlushAt < NORMAL_MIN_INTERVAL_MS) {
    rafHandle = scheduleRaf(flushNormalJobs)
    return
  }
  lastNormalFlushAt = now

  for (const [key, job] of [...pendingByKey.entries()]) {
    if (job.priority !== 'normal') continue
    runPendingJob(key, job)
  }
}

function scheduleNormalFlush(): void {
  if (rafHandle != null) return
  rafHandle = scheduleRaf(flushNormalJobs)
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
    visibleConversationId = options.visibleConversationId?.trim() || null
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
  if (rafHandle != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rafHandle)
  }
  rafHandle = null
  lastNormalFlushAt = 0
}
