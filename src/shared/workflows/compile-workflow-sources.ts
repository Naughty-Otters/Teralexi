import type { WorkflowDefinition } from './schema'
import { WORKFLOW_DEFINITION_VERSION } from './schema'
import { WORKFLOW_RUNTIME_AGENT_ID } from '@shared/skills/workflow-panel-skills'
import { parseEntitiesMd } from './parse-entities-md'
import { parseWorkflowMd } from './parse-workflow-md'

export type CompileWorkflowSourcesResult = {
  definition: WorkflowDefinition
  workflowErrors: string[]
  entityErrors: string[]
}

/** Merge workflow.md + entities.md into a WorkflowDefinition draft. */
export function compileWorkflowSources(args: {
  workflowMd: string
  entitiesMd: string
  seed: {
    id: string
    name: string
    description?: string
  }
}): CompileWorkflowSourcesResult {
  const workflowParsed = parseWorkflowMd(args.workflowMd)
  const entitiesParsed = parseEntitiesMd(args.entitiesMd)

  const definition: WorkflowDefinition = {
    version: WORKFLOW_DEFINITION_VERSION,
    id: args.seed.id,
    name: workflowParsed.partial.name ?? args.seed.name,
    description: workflowParsed.partial.description ?? args.seed.description,
    status: 'draft',
    executor: { agentId: WORKFLOW_RUNTIME_AGENT_ID },
    triggers: workflowParsed.partial.triggers ?? [{ type: 'manual' }],
    steps: workflowParsed.partial.steps ?? [],
    entities: entitiesParsed.entities.length > 0 ? entitiesParsed.entities : undefined,
    conditionals: workflowParsed.partial.conditionals,
  }

  return {
    definition,
    workflowErrors: workflowParsed.errors,
    entityErrors: entitiesParsed.errors,
  }
}
