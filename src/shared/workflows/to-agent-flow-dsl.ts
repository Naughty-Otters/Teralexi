import type { AgentFlowDsl, DslStageEntry } from '@main/agent/flow/dsl/schema'
import type { WorkflowDefinition, WorkflowStep } from './schema'

const TOOL_LOOP_STEP_ID = 'toolLoop'
const FOREACH_ITEM_STEP_ID = 'foreachItem'

function workflowStepToDslEntry(step: WorkflowStep): DslStageEntry {
  if (step.type === 'task') {
    const stage = step.stage?.trim() || TOOL_LOOP_STEP_ID
    return {
      stage,
      title: step.title,
      expression: step.expression,
      precondition: step.precondition,
    }
  }

  if (step.type === 'plan_foreach') {
    const forEach =
      step.todosFrom === 'inline' && step.todos?.length
        ? {
            preset: 'hasTodoItems' as const,
            expression: step.expression,
          }
        : {
            preset: 'hasTodoItems' as const,
            expression: step.expression,
          }

    return {
      stage: FOREACH_ITEM_STEP_ID,
      title: step.title ?? step.id,
      forEach,
    }
  }

  // Channel steps compile to tool-loop expressions invoking collect/send tools.
  if (step.action === 'collect_form') {
    return {
      stage: TOOL_LOOP_STEP_ID,
      title: step.title ?? step.id,
      expression: {
        title: step.title ?? step.id,
        tool: 'collectFormData',
        prompt: `Collect form ${step.form ?? 'approval'} via channel ${step.channelId}`,
      },
    }
  }

  return {
    stage: TOOL_LOOP_STEP_ID,
    title: step.title ?? step.id,
    expression: {
      title: step.title ?? step.id,
      prompt: step.template ?? `Send notification on ${step.channelId}`,
    },
  }
}

/** Convert a WorkflowDefinition into the existing AgentFlowDsl pipeline format. */
export function workflowDefinitionToAgentFlowDsl(
  definition: WorkflowDefinition,
): AgentFlowDsl {
  const pipeline = definition.steps.map(workflowStepToDslEntry)

  const conditionals = (definition.conditionals ?? []).map((branch, index) => {
    const afterStage = definition.steps.findIndex(
      (s) => s.id === branch.afterStepId,
    )
    const thenEntries = branch.thenStepIds
      .map((id) => definition.steps.find((s) => s.id === id))
      .filter((s): s is WorkflowStep => Boolean(s))
      .map(workflowStepToDslEntry)
    const elseEntries = (branch.elseStepIds ?? [])
      .map((id) => definition.steps.find((s) => s.id === id))
      .filter((s): s is WorkflowStep => Boolean(s))
      .map(workflowStepToDslEntry)

    return {
      afterStage: afterStage >= 0 ? afterStage : index,
      when: branch.when,
      then: thenEntries,
      else: elseEntries,
    }
  })

  return {
    pipeline,
    ...(conditionals.length > 0 ? { conditionals } : {}),
  }
}
