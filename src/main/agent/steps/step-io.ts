import type { FlowStageId } from '../constants/step-ids'
import type {
  TodoItem,
  ReferenceDoc,
  ReferenceScript,
  ThinkingExecutionMode,
} from '../types'
import type { ResearchFinding } from './research/config'

// ─────────────────────────────────────────────────────────────────────────────
// Base types
// ─────────────────────────────────────────────────────────────────────────────

/** Base interface all step output data must extend. */
export interface StepData {
  /** Human-readable rendering (used for progress/assistant thread). */
  rendered?: string
}

/** A single output record in the store. */
export interface StepOutputEntry<T extends StepData = StepData> {
  stepId: FlowStageId
  instanceKey: string
  data: T
  timestamp: string
}

/** How multiple outputs for the same step are resolved when querying. */
export type MergeStrategy = 'latest' | 'aggregate'

// ─────────────────────────────────────────────────────────────────────────────
// Per-step data types
// ─────────────────────────────────────────────────────────────────────────────

/** Output of the Thinking step. */
export interface ThinkingStepData extends StepData {
  raw: string
  execution_mode?: ThinkingExecutionMode
  goal?: string
  task?: string
  context?: string[]
  rationale?: string
  response?: string
}

/** Output of the Planning step. */
export interface PlanningStepData extends StepData {
  finalGoal: string
  todoList: TodoItem[]
  expectations: string[]
}

/** Output of the Summary step. */
export interface SummaryStepData extends StepData {
  summary: string
  goalAchieved: boolean
  waysToAchieveGoalBetter: string
  shouldMemorize: boolean
  memorizeReason: string
}

/** Output for string-based steps (toolLoop, skills, report, prompt). */
export interface TextStepData extends StepData {
  text: string
}

/** Output of the Search step. */
export interface SearchStepData extends StepData {
  topic: string
  items: Array<{
    address: string
    brief: string
    title?: string
  }>
  /** LLM synthesis across all search hits. */
  abstraction: string
  searchEngine?: string
  searchUrl?: string
  text?: string
}

/** Output of the Create Paper step. */
export interface CreatePaperStepData extends StepData {
  topic: string
  abstraction: string
  sourceCount: number
  /** Absolute path to the written research report PDF. */
  outputPath: string
  /** Full LLM-authored report body (markdown); written to PDF. */
  paperMarkdown?: string
  text?: string
}

/** Output of the iterative Research step. */
export interface ResearchStepData extends StepData {
  topic: string
  findings: ResearchFinding[]
  digestMarkdown: string
  text?: string
}

/** Output of the Web Scrape step (one aggregate or per-page records). */
export interface WebScrapeStepData extends StepData {
  address?: string
  title?: string
  brief?: string
  outputPath?: string
  pages?: Array<{
    address: string
    title?: string
    brief?: string
    outputPath: string
    /** Full scraped body when persisted (used by create-report). */
    markdown?: string
  }>
  markdown?: string
  text?: string
}

// Re-export TodoItem and reference types for convenience
export type { TodoItem, ReferenceDoc, ReferenceScript }
