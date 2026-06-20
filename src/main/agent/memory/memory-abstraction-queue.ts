import { createLogger } from '@main/logger'
import type { AgentMemoryBlock } from './types'
import {
  abstractAgentPersonaForBlock,
  abstractSessionForBlock,
  abstractUserPersonaForBlock,
} from './memory-abstraction-runners'

const log = createLogger('agent.memory.queue')

/** Max concurrent LLM abstraction jobs in the main process. */
const DEFAULT_MAX_CONCURRENCY = 1

export type MemoryAbstractionJobKind = 'session' | 'agent-persona' | 'user-persona'

export type MemoryAbstractionJob = {
  kind: MemoryAbstractionJobKind
  agentId: string
  conversationId: string
  userId: string
  block: AgentMemoryBlock
  model: unknown
  responseLanguage?: string
}

export type EnqueueMemoryAbstractionJobsInput = {
  block: AgentMemoryBlock
  model: unknown
  responseLanguage?: string
  session: boolean
  persona: boolean
}

function jobKey(job: MemoryAbstractionJob): string {
  switch (job.kind) {
    case 'session':
      return `session:${job.agentId}:${job.conversationId}`
    case 'agent-persona':
      return `agent-persona:${job.agentId}`
    case 'user-persona':
      return `user-persona:${job.userId}`
  }
}

function jobKindPriority(kind: MemoryAbstractionJobKind): number {
  switch (kind) {
    case 'session':
      return 0
    case 'agent-persona':
      return 1
    case 'user-persona':
      return 2
  }
}

export class MemoryAbstractionQueue {
  private readonly maxConcurrency: number
  private readonly pendingJobs = new Map<string, MemoryAbstractionJob>()
  private readonly pendingOrder: string[] = []
  private activeCount = 0
  private drainScheduled = false

  constructor(maxConcurrency = DEFAULT_MAX_CONCURRENCY) {
    this.maxConcurrency = Math.max(1, Math.floor(maxConcurrency))
  }

  enqueueFromExchange(input: EnqueueMemoryAbstractionJobsInput): void {
    const jobs: MemoryAbstractionJob[] = []
    if (input.session) {
      jobs.push({
        kind: 'session',
        agentId: input.block.agentId,
        conversationId: input.block.conversationId,
        userId: input.block.userId,
        block: input.block,
        model: input.model,
        responseLanguage: input.responseLanguage,
      })
    }
    if (input.persona) {
      jobs.push({
        kind: 'agent-persona',
        agentId: input.block.agentId,
        conversationId: input.block.conversationId,
        userId: input.block.userId,
        block: input.block,
        model: input.model,
        responseLanguage: input.responseLanguage,
      })
      jobs.push({
        kind: 'user-persona',
        agentId: input.block.agentId,
        conversationId: input.block.conversationId,
        userId: input.block.userId,
        block: input.block,
        model: input.model,
        responseLanguage: input.responseLanguage,
      })
    }
    for (const job of jobs) {
      this.enqueue(job)
    }
  }

  enqueue(job: MemoryAbstractionJob): void {
    const key = jobKey(job)
    const replaced = this.pendingJobs.has(key)
    this.pendingJobs.set(key, job)
    if (!replaced) {
      this.pendingOrder.push(key)
    }
    this.scheduleDrain()
  }

  clear(): void {
    this.pendingJobs.clear()
    this.pendingOrder.length = 0
    this.activeCount = 0
    this.drainScheduled = false
  }

  getPendingCount(): number {
    return this.pendingJobs.size
  }

  getActiveCount(): number {
    return this.activeCount
  }

  private scheduleDrain(): void {
    if (this.drainScheduled) return
    this.drainScheduled = true
    queueMicrotask(() => {
      this.drainScheduled = false
      this.startPendingJobs()
    })
  }

  private startPendingJobs(): void {
    while (
      this.activeCount < this.maxConcurrency &&
      this.pendingJobs.size > 0
    ) {
      const key = this.dequeueNextKey()
      if (!key) break

      const job = this.pendingJobs.get(key)
      this.pendingJobs.delete(key)
      if (!job) continue

      this.activeCount += 1
      void this.runJob(job)
        .catch((err) => {
          log.warn('Memory abstraction job failed', {
            kind: job.kind,
            agentId: job.agentId,
            conversationId: job.conversationId,
            userId: job.userId,
            blockId: job.block.blockId,
            err,
          })
        })
        .finally(() => {
          this.activeCount -= 1
          this.scheduleDrain()
        })
    }
  }

  private dequeueNextKey(): string | undefined {
    if (this.pendingOrder.length === 0) return undefined

    let bestIndex = 0
    let bestKey = this.pendingOrder[0]!
    let bestJob = this.pendingJobs.get(bestKey)
    if (!bestJob) {
      this.pendingOrder.shift()
      return this.dequeueNextKey()
    }

    for (let i = 1; i < this.pendingOrder.length; i++) {
      const key = this.pendingOrder[i]!
      const job = this.pendingJobs.get(key)
      if (!job) continue
      const bestPriority = jobKindPriority(bestJob.kind)
      const nextPriority = jobKindPriority(job.kind)
      if (
        nextPriority < bestPriority ||
        (nextPriority === bestPriority && i < bestIndex)
      ) {
        bestIndex = i
        bestKey = key
        bestJob = job
      }
    }

    this.pendingOrder.splice(bestIndex, 1)
    return bestKey
  }

  private async runJob(job: MemoryAbstractionJob): Promise<void> {
    log.info('Running memory abstraction job', {
      kind: job.kind,
      agentId: job.agentId,
      conversationId: job.conversationId,
      userId: job.userId,
      blockId: job.block.blockId,
    })

    switch (job.kind) {
      case 'session':
        await abstractSessionForBlock({
          block: job.block,
          model: job.model,
          responseLanguage: job.responseLanguage,
        })
        break
      case 'agent-persona':
        await abstractAgentPersonaForBlock({
          block: job.block,
          model: job.model,
          responseLanguage: job.responseLanguage,
        })
        break
      case 'user-persona':
        await abstractUserPersonaForBlock({
          block: job.block,
          model: job.model,
          responseLanguage: job.responseLanguage,
        })
        break
    }

    log.info('Memory abstraction job completed', {
      kind: job.kind,
      agentId: job.agentId,
      conversationId: job.conversationId,
      userId: job.userId,
      blockId: job.block.blockId,
    })
  }
}

let queueInstance: MemoryAbstractionQueue | null = null

export function getMemoryAbstractionQueue(): MemoryAbstractionQueue {
  if (!queueInstance) {
    queueInstance = new MemoryAbstractionQueue()
  }
  return queueInstance
}

/** @internal Test helper */
export function resetMemoryAbstractionQueueForTests(): void {
  queueInstance?.clear()
  queueInstance = null
}
