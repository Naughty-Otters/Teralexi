import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

const MAX_LEDGER_PATHS = 30

export function formatSessionReadLedger(paths: readonly string[]): string | null {
  if (paths.length === 0) return null
  const shown = paths.slice(0, MAX_LEDGER_PATHS)
  const lines = [
    '### Session read ledger',
    'These paths were already read earlier in this user turn (explore, planning, or prior todos). Do not `read_file` the same path+offset+limit again — use prior results, read the next page with a new `offset` (see the prior `note`), or pass `reason` if you truly need a fresh read.',
    ...shown.map((p) => `- \`${p}\``),
  ]
  if (paths.length > shown.length) {
    lines.push(`- …and ${paths.length - shown.length} more`)
  }
  return lines.join('\n')
}

export const sessionToolLedgerInjector: AgentInjector = {
  id: 'session-tool-ledger',
  order: INJECTOR_ORDER.SESSION_TOOL_LEDGER,
  applies({ profile, ctx }) {
    if (!profile.isCodingAgent) return false
    if (profile.stage !== 'toolLoop' && profile.stage !== 'todoExecution') {
      return false
    }
    return ctx.agentFlow.toolReadCache.listReadPaths().length > 0
  },
  injectInstructions({ ctx }) {
    return formatSessionReadLedger(ctx.agentFlow.toolReadCache.listReadPaths())
  },
}
