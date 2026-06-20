export type SubFlowMergeOutputs = 'report' | 'summary' | 'all'

export type SubFlowConfig = {
  /** Engine agent id from the catalog. */
  agentId: string
  /** Task passed to the child agent as the latest user message. */
  task?: string
  /** Which child output to surface on the parent step (default `report`). */
  mergeOutputs?: SubFlowMergeOutputs
}
