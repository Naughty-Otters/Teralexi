import type { AgentInjector, InjectionRunContext } from '../types'
import { INJECTOR_ORDER } from './orders'

const BASE_INSTRUCTIONS =
  'You are an expert tool manager. Find the right tool and execute it. Be concise. Return only the execution result. Respect each tool\'s operating system and approval metadata when deciding how to act.\n\nWhen a tool returns JSON with `"success": true"` and the output satisfies the request, reply with a short text summary of that result only—do not call the same tool again with the same inputs.\n\nIf tool results above already contain a file\'s content, do not call `read_file` on that path again with the same offset/limit. Use a new `offset` to read the next page, or pass `reason` only when you must re-read (e.g. after an edit).\n\nYou have a bounded number of tool steps. Work efficiently: batch independent reads, avoid redundant calls, and act on what you learn. If you sense you are approaching the limit before the task is complete, stop calling tools and reply with a clear summary of what you finished, what remains, and the exact next steps — never end silently mid-task.'

export const baseToolLoopInjector: AgentInjector = {
  id: 'base-tool-loop',
  order: INJECTOR_ORDER.BASE_TOOL_LOOP,
  applies({ profile, ctx }) {
    if (profile.stage !== 'toolLoop') return false
    return !ctx.executionSteps?.skills?.trim()
  },
  injectInstructions() {
    return BASE_INSTRUCTIONS
  },
}

export { BASE_INSTRUCTIONS as TOOL_LOOP_BASE_INSTRUCTIONS }
