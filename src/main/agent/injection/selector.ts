import { skillIsCodingAgent } from '@shared/agent/coding-agent'
import type { AgentStepContext } from '../context'
import type {
  AgentInjector,
  InjectionProfile,
  InjectionProfileKey,
  InjectionStage,
} from './types'
import { getInjectorById } from './registry'

const TOOL_LOOP_DEFAULT_INSTRUCTIONS = [
  'base-tool-loop',
  'skills',
  'skill-system-properties',
  'validation-rules',
  'run-script-preference',
  'memory-persona',
  'project-rules',
  'sub-agents',
  'previous-step',
  'sandbox-structure',
  'diagram-output',
  'workspace-open-files',
  'git-status',
  'workspace-structure',
  'language',
  'plan-mode',
  'deep-thinking-after-answer',
] as const

const TOOL_LOOP_CODING_INSTRUCTIONS = [
  'base-tool-loop',
  'skills',
  'skill-system-properties',
  'validation-rules',
  'run-script-preference',
  'task-tracking',
  'memory-persona',
  'project-rules',
  'sub-agents',
  'coding-mode-instructions',
  'previous-step',
  'sandbox-structure',
  'diagram-output',
  'workspace-open-files',
  'git-status',
  'workspace-structure',
  'session-tool-ledger',
  'language',
  'deep-thinking-after-answer',
] as const

const TODO_EXECUTION_INSTRUCTIONS = [
  'executor-base',
  'step-goal',
  'explore-manifest',
  'session-tool-ledger',
  'previous-step',
  'sandbox-structure',
  'diagram-output',
  'workspace-open-files',
  'git-status',
  'workspace-structure',
  'tool-result-rules',
  'memory-persona',
  'project-rules',
  'language',
] as const

const TODO_EXECUTION_USER_MESSAGES = [
  'deep-thinking-before-answer',
  'multiple-branch-thinking',
  'current-datetime',
  'user-uploads',
] as const

const TOOL_LOOP_DEFAULT_USER_MESSAGES = [
  'deep-thinking-before-answer',
  'multiple-branch-thinking',
  'current-datetime',
  'user-uploads',
  'plan-mode',
] as const

const TOOL_LOOP_CODING_ROOT_USER_MESSAGES = [
  'deep-thinking-before-answer',
  'multiple-branch-thinking',
  'current-datetime',
  'user-uploads',
] as const
const TOOL_LOOP_CODING_CHILD_USER_MESSAGES = [
  'deep-thinking-before-answer',
  'multiple-branch-thinking',
  'current-datetime',
  'user-uploads',
  'plan-mode',
] as const

const PROFILE_INJECTOR_IDS: Record<InjectionProfileKey, readonly string[]> = {
  'toolLoop.default': TOOL_LOOP_DEFAULT_INSTRUCTIONS,
  'toolLoop.coding.root': [
    ...TOOL_LOOP_CODING_INSTRUCTIONS,
    'plan-mode',
  ],
  'toolLoop.coding.child': TOOL_LOOP_CODING_INSTRUCTIONS,
  todoExecution: TODO_EXECUTION_INSTRUCTIONS,
}

const PROFILE_USER_MESSAGE_INJECTOR_IDS: Partial<
  Record<InjectionProfileKey, readonly string[]>
> = {
  'toolLoop.default': TOOL_LOOP_DEFAULT_USER_MESSAGES,
  'toolLoop.coding.root': TOOL_LOOP_CODING_ROOT_USER_MESSAGES,
  'toolLoop.coding.child': TOOL_LOOP_CODING_CHILD_USER_MESSAGES,
  todoExecution: TODO_EXECUTION_USER_MESSAGES,
}

function resolveRunDepth(ctx: AgentStepContext): number {
  return ctx.agentRun?.meta?.depth ?? 0
}

export function resolveInjectionProfile(
  ctx: AgentStepContext,
  stage: InjectionStage,
): InjectionProfile {
  const skillId = ctx.opts.skillId
  const isCodingAgent = skillIsCodingAgent(skillId)
  const runDepth = resolveRunDepth(ctx)

  if (stage === 'todoExecution') {
    return {
      key: 'todoExecution',
      stage,
      skillId,
      runDepth,
      isCodingAgent,
      planModeUsesPrepareStep: false,
    }
  }

  if (!isCodingAgent) {
    return {
      key: 'toolLoop.default',
      stage,
      skillId,
      runDepth,
      isCodingAgent: false,
      planModeUsesPrepareStep: false,
    }
  }

  if (runDepth === 0) {
    return {
      key: 'toolLoop.coding.root',
      stage,
      skillId,
      runDepth,
      isCodingAgent: true,
      planModeUsesPrepareStep: true,
    }
  }

  return {
    key: 'toolLoop.coding.child',
    stage,
    skillId,
    runDepth,
    isCodingAgent: true,
    planModeUsesPrepareStep: false,
  }
}

function resolveInjectors(ids: readonly string[]): AgentInjector[] {
  const injectors: AgentInjector[] = []
  for (const id of ids) {
    const injector = getInjectorById(id)
    if (injector) injectors.push(injector)
  }
  return injectors
}

export function selectInjectors(profile: InjectionProfile): AgentInjector[] {
  return resolveInjectors(PROFILE_INJECTOR_IDS[profile.key])
}

export function selectInstructionInjectors(
  profile: InjectionProfile,
): AgentInjector[] {
  return selectInjectors(profile)
}

export function selectUserMessageInjectors(
  profile: InjectionProfile,
): AgentInjector[] {
  const ids = PROFILE_USER_MESSAGE_INJECTOR_IDS[profile.key] ?? []
  return resolveInjectors(ids)
}
