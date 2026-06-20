import type { AgentFlowContext } from '../../context'
import { SEARCH_STEP_ID } from '../../constants/step-ids'
import type { SearchStepData } from '../step-io'
import type { SearchResultItem } from '../search-config'

export function searchResultItemsFromFlow(
  ctx: AgentFlowContext,
): SearchResultItem[] {
  const data = ctx.outputStore.latest<SearchStepData>(SEARCH_STEP_ID)
  return data?.items?.filter((item) => item.address?.trim()) ?? []
}
