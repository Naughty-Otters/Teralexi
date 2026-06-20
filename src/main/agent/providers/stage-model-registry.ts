import {
  parseAgentStageLlmSettings,
  resolveStageLlmChoice,
  type AgentLlmChoice,
  type AgentLlmStage,
  type AgentStageLlmSettings,
} from '@shared/agent/stage-llm-settings'
import type { AgentResponseOpts } from '../types'
import { createModelForProvider } from './adapters'

export class StageModelRegistry {
  private readonly cache = new Map<string, unknown>()

  constructor(
    private readonly settings: AgentStageLlmSettings,
    private readonly creds: AgentResponseOpts,
  ) {}

  static fromOpts(opts: AgentResponseOpts): StageModelRegistry {
    const settings =
      opts.stageLlm ??
      parseAgentStageLlmSettings({
        provider: opts.provider,
        model: opts.model,
        routingMode: 'unified',
      })
    return new StageModelRegistry(settings, opts)
  }

  getChoice(stage: AgentLlmStage | 'default'): AgentLlmChoice {
    if (stage === 'default') return this.settings.default
    return resolveStageLlmChoice(this.settings, stage)
  }

  getModel(stage: AgentLlmStage | 'default'): unknown {
    if (!this.cache.has(stage)) {
      const choice = this.getChoice(stage)
      this.cache.set(
        stage,
        createModelForProvider(choice.provider, choice.model, this.creds),
      )
    }
    return this.cache.get(stage)!
  }
}
