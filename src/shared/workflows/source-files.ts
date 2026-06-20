export const WORKFLOW_DEFINITION_JSON_FILENAME = 'workflow_definition.json' as const
export const ENTITIES_DEFINITION_JSON_FILENAME = 'entities_definition.json' as const

/** @deprecated Migrated to workflow_definition.json + entities_definition.json */
export const DEFINITION_JSON_FILENAME = 'definition.json' as const

/** @deprecated Legacy markdown sources */
export const WORKFLOW_MD_FILENAME = 'workflow.md' as const

/** @deprecated Legacy markdown sources */
export const ENTITIES_MD_FILENAME = 'entities.md' as const

export type WorkflowDefinitionSource = {
  workflowDefinitionJson: string
  entitiesDefinitionJson: string
}

/** @deprecated Use {@link WorkflowDefinitionSource} */
export type WorkflowSourceFiles = WorkflowDefinitionSource

export {
  serializeWorkflowDefinitionBody,
  serializeWorkflowDefinitionBodyFromUnknown,
  parseWorkflowDefinitionBodyJson,
  safeParseWorkflowDefinitionBodyJson,
  serializeEntitiesDefinition,
  serializeEntitiesDefinitionFromUnknown,
  parseEntitiesDefinitionJson,
  safeParseEntitiesDefinitionJson,
  mergeWorkflowSourceJson,
  mergeWorkflowDefinition,
  serializeWorkflowDefinition,
  serializeWorkflowDefinitionFromUnknown,
  parseWorkflowDefinitionJson,
  safeParseWorkflowDefinitionJson,
  safeParseWorkflowEntities,
  serializeWorkflowEntities,
} from './definition-serialization'

import {
  serializeWorkflowDefinitionBodyFromUnknown,
  serializeEntitiesDefinitionFromUnknown,
} from './definition-serialization'

/** @deprecated Use {@link serializeWorkflowDefinitionBodyFromUnknown} */
export function formatWorkflowDefinitionJson(definition: unknown): string {
  return serializeWorkflowDefinitionBodyFromUnknown(definition)
}

export function formatEntitiesDefinitionJson(entities: unknown): string {
  return serializeEntitiesDefinitionFromUnknown(entities)
}
