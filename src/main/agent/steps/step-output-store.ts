import type { FlowStageId } from '../constants/step-ids'
import type { StepData, StepOutputEntry } from './step-io'

/**
 * Generic output store for pipeline steps.
 * Stores a list of output entries per step id — supports both "latest" and "aggregate" retrieval.
 */
export class StepOutputStore {
  private entries = new Map<FlowStageId, StepOutputEntry[]>()

  /** Add an output entry for a step. */
  push<T extends StepData>(entry: StepOutputEntry<T>): void {
    const list = this.entries.get(entry.stepId) ?? []
    list.push(entry as StepOutputEntry)
    this.entries.set(entry.stepId, list)
  }

  /** Get the latest output data for a step, cast to `T`. */
  latest<T extends StepData>(stepId: FlowStageId): T | undefined {
    const list = this.entries.get(stepId)
    if (!list || list.length === 0) return undefined
    return list[list.length - 1]!.data as T
  }

  /** Get all output entries for a step. */
  all(stepId: FlowStageId): StepOutputEntry[] {
    return this.entries.get(stepId) ?? []
  }

  /** True if at least one output entry exists for the step. */
  has(stepId: FlowStageId): boolean {
    const list = this.entries.get(stepId)
    return list != null && list.length > 0
  }

  /** All step ids that have at least one entry. */
  keys(): FlowStageId[] {
    return [...this.entries.keys()]
  }

  /** Remove all entries. */
  clear(): void {
    this.entries.clear()
  }

  /** Deep clone the entire store (for pending-state serialization). */
  clone(): StepOutputStore {
    const copy = new StepOutputStore()
    for (const [stepId, list] of this.entries) {
      copy.entries.set(stepId, structuredClone(list))
    }
    return copy
  }

  /** Serialize to a plain object for JSON persistence. */
  toJSON(): Record<string, StepOutputEntry[]> {
    const result: Record<string, StepOutputEntry[]> = {}
    for (const [stepId, list] of this.entries) {
      result[stepId] = list
    }
    return result
  }

  /** Restore from a serialized plain object. */
  static fromJSON(json: Record<string, StepOutputEntry[]>): StepOutputStore {
    const store = new StepOutputStore()
    for (const [stepId, list] of Object.entries(json)) {
      if (Array.isArray(list)) {
        store.entries.set(stepId as FlowStageId, list)
      }
    }
    return store
  }
}
