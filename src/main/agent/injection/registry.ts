import type { AgentInjector } from './types'
import { currentDatetimeInjector } from './injectors/current-datetime'
import { baseToolLoopInjector } from './injectors/base-tool-loop'
import { skillsInjector } from './injectors/skills'
import { validationRulesInjector } from './injectors/validation-rules'
import { runScriptPreferenceInjector } from './injectors/run-script-preference'
import { taskTrackingInjector } from './injectors/task-tracking'
import { memoryPersonaInjector } from './injectors/memory-persona'
import { projectRulesInjector } from './injectors/project-rules'
import { codingModeInstructionsInjector } from './injectors/coding-mode-instructions'
import { previousStepInjector } from './injectors/previous-step'
import { sandboxStructureInjector } from './injectors/sandbox-structure'
import { workspaceStructureInjector } from './injectors/workspace-structure'
import { languageInjector } from './injectors/language'
import { planModeInjector } from './injectors/plan-mode'
import { subAgentsInjector } from './injectors/sub-agents'
import { executorBaseInjector } from './injectors/executor-base'
import { stepGoalInjector } from './injectors/step-goal'
import { toolResultRulesInjector } from './injectors/tool-result-rules'
import { exploreManifestInjector } from './injectors/explore-manifest'
import { sessionToolLedgerInjector } from './injectors/session-tool-ledger'
import { deepThinkingBeforeAnswerInjector } from './injectors/deep-thinking-before-answer'
import { multipleBranchThinkingInjector } from './injectors/multiple-branch-thinking'
import { deepThinkingAfterAnswerInjector } from './injectors/deep-thinking-after-answer'
import { diagramOutputInjector } from './injectors/diagram-output'
import { userUploadsInjector } from './injectors/user-uploads'

const ALL_INJECTORS: AgentInjector[] = [
  deepThinkingBeforeAnswerInjector,
  multipleBranchThinkingInjector,
  currentDatetimeInjector,
  userUploadsInjector,
  deepThinkingAfterAnswerInjector,
  baseToolLoopInjector,
  skillsInjector,
  validationRulesInjector,
  runScriptPreferenceInjector,
  taskTrackingInjector,
  memoryPersonaInjector,
  projectRulesInjector,
  subAgentsInjector,
  codingModeInstructionsInjector,
  previousStepInjector,
  sandboxStructureInjector,
  diagramOutputInjector,
  workspaceStructureInjector,
  languageInjector,
  planModeInjector,
  executorBaseInjector,
  stepGoalInjector,
  exploreManifestInjector,
  sessionToolLedgerInjector,
  toolResultRulesInjector,
]

const byId = new Map<string, AgentInjector>(
  ALL_INJECTORS.map((injector) => [injector.id, injector]),
)

export function getInjectorById(id: string): AgentInjector | undefined {
  return byId.get(id)
}

export function getAllInjectors(): readonly AgentInjector[] {
  return ALL_INJECTORS
}
