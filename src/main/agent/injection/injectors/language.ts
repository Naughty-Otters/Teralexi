import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const languageInjector: AgentInjector = {
  id: 'language',
  order: INJECTOR_ORDER.LANGUAGE,
  applies() {
    return true
  },
  injectInstructions({ ctx, assembledInstructions = '' }) {
    return ctx.config.withResponseLanguageInstruction(
      assembledInstructions,
      ctx.opts.responseLanguage,
    )
  },
}
