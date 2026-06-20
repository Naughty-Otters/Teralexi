import type { FlowStageId } from '../../constants/step-ids'
import type { SearchConfig } from '../../steps/search-config'
import type { WebScrapeConfig } from '../../steps/web-scrape-config'
import type { CreatePaperConfig } from '../../steps/create-paper-config'

export type DslExpression = {
  system_msg?: string
  prompt?: string
  title?: string
  tool?: string
  else_tool?: string
  else_goto?: string
  precondition?: string
  when?: string
}

export type DslForEach = {
  preset?: 'hasTodoItems' | 'webScrape'
  startIndex?: number
  maxItems?: number
  maxChars?: number
  expression?: DslExpression
}

export type DslSubFlow = {
  agentId: string
  task?: string
  mergeOutputs?: 'report' | 'summary' | 'all'
}

export type DslSearch = SearchConfig

export type DslWebScrape = WebScrapeConfig

export type DslCreatePaper = CreatePaperConfig

export type DslStageEntry = {
  stage: FlowStageId | string
  title?: string
  expression?: DslExpression
  forEach?: DslForEach
  subFlow?: DslSubFlow
  search?: DslSearch
  webScrape?: DslWebScrape
  createPaper?: DslCreatePaper
  precondition?: string
}

export type DslConditional = {
  afterStage: number
  when: string
  then: DslStageEntry[]
  else: DslStageEntry[]
}

export type AgentFlowDsl = {
  pipeline: DslStageEntry[]
  conditionals?: DslConditional[]
}
