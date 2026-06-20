/** LLM-facing strings for the agent package (prompts, pipeline context, sandbox). */

export const RESPONSE_LANGUAGE_LLM = {
  TEMPLATE:
    'Respond in {language}. Keep all user-facing output in {language} unless the user explicitly asks for another language or a translation.',
} as const

export function buildResponseLanguageInstruction(language: string): string {
  return RESPONSE_LANGUAGE_LLM.TEMPLATE.replace(/\{language\}/g, language)
}

export const TOOL_PROMPT_LLM = {
  OS_LINE: 'Operating system: {os}. Use OS-appropriate commands and paths.',
  APPROVAL_LINE: 'Approval required: {required}.',
} as const

export const PIPELINE_CONTEXT_LLM = {
  THINKING: 'Thinking:',
  PLANNING: 'Planning:',
  FINAL_GOAL: 'Final goal:',
  RUN_EXPECTATIONS:
    'Success expectations (from planning; use these to judge goalAchieved):',
  PLANNED_TASKS: 'Planned tasks:',
  SKILLS_OUTPUT: 'Skills output:',
  TOOL_EXECUTION_ORDERED: 'Tool execution (planned tasks, in order):',
  TOOL_EXECUTION_OUTPUT: 'Tool execution output:',
  RUN_SUMMARY: 'Run summary (goal, plan, and execution):',
  SEARCH_OUTPUT: 'Search results:',
  WEB_SCRAPE_OUTPUT: 'Web scrape results:',
  CREATE_PAPER_OUTPUT: 'Research paper:',
  RESEARCH_OUTPUT: 'Research findings:',
  LINKED_SOURCES:
    'Linked sources (full text from scraped pages, search URLs, and markdown links when available):',
} as const

export const STRUCTURED_CONTENT_LLM = {
  SECTION_THINKING: '**Thinking**',
  SECTION_GOALS_COMPLETED: '**Goals & completed work**',
  SECTION_PLANNING: '**Planning**',
  SECTION_SKILLS_TOOL: '**Skills & tool execution**',
  SECTION_SUMMARY: '**Summary**',
  SECTION_REPORT: '**Report**',
  SECTION_RESEARCH_REPORT: '**Research report**',
  SECTION_SEPARATOR: '\n\n---\n\n',
  TASK_HEADER: '**Task {id}: {name} ({status})**',
  TASK_UNNAMED: '(unnamed)',
  GOAL_PREFIX: 'Goal:',
  COMPLETED_TASK: 'Task {id}: {description}',
} as const
