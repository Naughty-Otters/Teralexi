import {
  ENTITIES_DEFINITION_JSON_FILENAME,
  WORKFLOW_DEFINITION_JSON_FILENAME,
} from '@shared/workflows/source-files'

export const WORKFLOW_COMPILER_SOURCE_SCOPE_APPENDIX = `
Workflow source folder — two JSON files:
- ${WORKFLOW_DEFINITION_JSON_FILENAME}: workflow body (triggers, steps, executor — no entities)
- ${ENTITIES_DEFINITION_JSON_FILENAME}: JSON array of business entities and fields

Use read/write/edit_workflow_definition for the workflow file.
Use read/write/edit_entities_definition for the entities file, or add_entity_field / update_entity_field / delete_entity_field for field changes.

Every write/edit validates the schema immediately. When valid=false, read validationErrors, fix the file, and edit again. Do not finish until both files validate together.`

export {
  defaultBlankWorkflowDefinitionSource,
  defaultBlankWorkflowSourceFiles,
  syncWorkflowSourceFiles,
} from './workflow-store'

export async function ensureWorkflowSourceFiles(args: {
  workflowId: string
  name: string
  description?: string
  version?: import('@main/services/conversation-store/types').StoredWorkflowVersion | null
}): Promise<void> {
  const { syncWorkflowSourceFiles } = await import('./workflow-store')
  syncWorkflowSourceFiles(args)
}
