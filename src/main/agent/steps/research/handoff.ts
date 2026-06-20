import type { AgentStepContext } from '../../context'
import type { ResolvedResearchConfig } from './config'

/** Optional hook after research completes (e.g. schedule search/scrape handoff). */
export function maybeScheduleResearchHandoff(
  _ctx: AgentStepContext,
  _config: ResolvedResearchConfig,
  _digestMarkdown: string,
): void {
  /* No-op until research handoff pipeline is wired. */
}
