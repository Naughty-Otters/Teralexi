import { ConfigContext } from './config/context'
import { FormContext } from './form/context'
import { ProviderContext } from './providers/context'
import { ReferenceContext } from './resources/context'
import { SandboxContext } from './sandbox/context'
import type { AgentResponseOpts } from './types'

/** Real module contexts for unit tests that mock {@link AgentStepContext} partially. */
export function createTestModuleContexts(options?: {
  responseLanguage?: string
  collectedFormByTodoId?: Record<number, Record<string, unknown>>
}) {
  const collectedFormByTodoId =
    options?.collectedFormByTodoId ??
    (Object.create(null) as Record<number, Record<string, unknown>>)
  const opts = {
    userId: 'test-user',
    provider: 'ollama',
    model: 'test-model',
    messages: [],
    responseLanguage: options?.responseLanguage ?? 'English',
  } as AgentResponseOpts

  const references = new ReferenceContext()

  return {
    config: new ConfigContext(() => opts.responseLanguage),
    providers: new ProviderContext(opts, {}),
    references,
    sandbox: new SandboxContext(references),
    form: new FormContext({
      collectedFormByTodoId,
      clientUiMessages: undefined,
    }),
  }
}
