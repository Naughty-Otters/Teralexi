import type { ForEachItemConfig } from '../steps/foreach-item-config'
import type { PipelineEntry } from './pipeline'
import { FlowFluentStages, type PipelineEntrySink } from './flow-fluent-stages'

/** Collects {@link PipelineEntry} rows inside `when().then_branch()` / `else_branch()` callbacks. */
export class FlowBranchCollector implements PipelineEntrySink {
  readonly entries: PipelineEntry[] = []
  private readonly fluents = new FlowFluentStages(this)

  pushPipelineEntry(entry: PipelineEntry): void {
    this.entries.push(entry)
  }

  step(...args: Parameters<FlowFluentStages<this>['step']>): this {
    this.fluents.step(...args)
    return this
  }

  customStep(...args: Parameters<FlowFluentStages<this>['customStep']>): this {
    this.fluents.customStep(...args)
    return this
  }

  thinking(...args: Parameters<FlowFluentStages<this>['thinking']>): this {
    this.fluents.thinking(...args)
    return this
  }

  toolLoop(...args: Parameters<FlowFluentStages<this>['toolLoop']>): this {
    this.fluents.toolLoop(...args)
    return this
  }

  forEachItem(config: ForEachItemConfig): this {
    this.fluents.forEachItem(config)
    return this
  }
}
