/**
 * Canonical pipeline stage ids and display titles.
 */

/** Thinking stage (fluent {@link AgentFlow.thinking}, no AgentStep class). */
export const THINKING_STEP_ID = 'thinking' as const
export const THINKING_STEP_TITLE = 'Thinking' as const

export const PLANNING_STEP_ID = 'planning' as const
export const PLANNING_STEP_TITLE = 'Planning' as const

export const SUMMARY_STEP_ID = 'summary' as const
export const SUMMARY_STEP_TITLE = 'Summary' as const

export const REPORT_STEP_ID = 'report' as const
export const REPORT_STEP_TITLE = 'Report' as const

export { AGENTIC_RUN_STEP_TITLE as TOOL_LOOP_STEP_TITLE } from '@shared/agent/agentic-run-labels'
export { formatAgenticRunTaskStepTitle as formatToolLoopTaskStepTitle } from '@shared/agent/agentic-run-labels'

export const TOOL_LOOP_STEP_ID = 'toolLoop' as const

/** Legacy step id for skills output in history / pipeline context. */
export const SKILLS_STEP_ID = 'skills' as const
export const SKILLS_STEP_TITLE = 'Skills' as const

export const PROMPT_STEP_ID = 'prompt' as const
export const PROMPT_STEP_TITLE = 'Custom prompt' as const

export const FOREACH_ITEM_STEP_ID = 'foreachItem' as const
export const FOREACH_ITEM_STEP_TITLE = 'For Each Item' as const

/** HITL form collection ({@link CollectFormDataStep}). */
export const COLLECT_FORM_STEP_ID = 'collectFormData' as const
export const COLLECT_FORM_STEP_TITLE = 'Collect Form Data' as const

/** Delegates to another agent pipeline ({@link AgentRun}). */
export const SUB_FLOW_STEP_ID = 'subFlow' as const
export const SUB_FLOW_STEP_TITLE = 'Sub-agent' as const

/** Web search without page scraping ({@link SearchOrchestrator}). */
export const SEARCH_STEP_ID = 'search' as const
export const SEARCH_STEP_TITLE = 'Search' as const

/** Scrape search hits to markdown under {@link WEB_SCRAPE_STEP_ID}/output/. */
export const WEB_SCRAPE_STEP_ID = 'webScrape' as const
export const WEB_SCRAPE_STEP_TITLE = 'Web Scrape' as const

/** Synthesize a research paper from search + scraped sources ({@link CreatePaperOrchestrator}). */
export const CREATE_PAPER_STEP_ID = 'createPaper' as const
export const CREATE_PAPER_STEP_TITLE = 'Research Report' as const

/** Iterative web research loop ({@link ResearchOrchestrator}). */
export const RESEARCH_STEP_ID = 'research' as const
export const RESEARCH_STEP_TITLE = 'Research' as const

/** Decomposes a multi-skill intent into an ordered SkillChainPlan ({@link SkillChainPlanningStep}). */
export const SKILL_CHAIN_PLANNING_STEP_ID = 'skillChainPlanning' as const
export const SKILL_CHAIN_PLANNING_STEP_TITLE = 'Planning skill chain' as const

/** Runs each agent in a SkillChainPlan sequentially, threading outputs ({@link ForEachSkillStep}). */
export const FOREACH_SKILL_STEP_ID = 'forEachSkill' as const
export const FOREACH_SKILL_STEP_TITLE = 'Running skill agents' as const

/** Legacy stage ids kept for history replay, DSL, and plan-mode todo storage keys. */
export const FLOW_PIPELINE_STEP_IDS = [
  PLANNING_STEP_ID,
  TOOL_LOOP_STEP_ID,
  SUMMARY_STEP_ID,
  REPORT_STEP_ID,
] as const

export type FlowStageId =
  | (typeof FLOW_PIPELINE_STEP_IDS)[number]
  | typeof THINKING_STEP_ID
  | typeof PROMPT_STEP_ID
  | typeof FOREACH_ITEM_STEP_ID
  | typeof SKILLS_STEP_ID
  | typeof SUB_FLOW_STEP_ID
  | typeof SEARCH_STEP_ID
  | typeof WEB_SCRAPE_STEP_ID
  | typeof CREATE_PAPER_STEP_ID
  | typeof RESEARCH_STEP_ID
  | typeof SKILL_CHAIN_PLANNING_STEP_ID
  | typeof FOREACH_SKILL_STEP_ID
