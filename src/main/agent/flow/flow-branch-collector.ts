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

  planning(...args: Parameters<FlowFluentStages<this>['planning']>): this {
    this.fluents.planning(...args)
    return this
  }

  summary(...args: Parameters<FlowFluentStages<this>['summary']>): this {
    this.fluents.summary(...args)
    return this
  }

  report(...args: Parameters<FlowFluentStages<this>['report']>): this {
    this.fluents.report(...args)
    return this
  }

  reportUnlessResearch(...args: Parameters<FlowFluentStages<this>['reportUnlessResearch']>): this {
    this.fluents.reportUnlessResearch(...args)
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

  forEachItemUnlessSkillChain(config: ForEachItemConfig): this {
    this.fluents.forEachItemUnlessSkillChain(config)
    return this
  }

  search(...args: Parameters<FlowFluentStages<this>['search']>): this {
    this.fluents.search(...args)
    return this
  }

  createPaper(...args: Parameters<FlowFluentStages<this>['createPaper']>): this {
    this.fluents.createPaper(...args)
    return this
  }

  createReport(...args: Parameters<FlowFluentStages<this>['createReport']>): this {
    this.fluents.createReport(...args)
    return this
  }

  createResearchReport(...args: Parameters<FlowFluentStages<this>['createResearchReport']>): this {
    this.fluents.createResearchReport(...args)
    return this
  }

  appendResearchPipeline(): this {
    this.fluents.appendResearchPipeline()
    return this
  }

  appendBranchAfterThinking(...args: Parameters<FlowFluentStages<this>['appendBranchAfterThinking']>): this {
    this.fluents.appendBranchAfterThinking(...args)
    return this
  }

  planningWhenThinkingWantsPlanning(): this {
    this.fluents.planningWhenThinkingWantsPlanning()
    return this
  }

  skillChainPlanning(): this {
    this.fluents.skillChainPlanning()
    return this
  }

  forEachSkill(): this {
    this.fluents.forEachSkill()
    return this
  }
}
