import { describe, expect, it } from 'vitest'
import { compileDsl, validateDsl, DslValidationError } from './compile'
import type { AgentFlowDsl } from './schema'
import {
  THINKING_STEP_ID,
  PLANNING_STEP_ID,
  TOOL_LOOP_STEP_ID,
  SUMMARY_STEP_ID,
  REPORT_STEP_ID,
  FOREACH_ITEM_STEP_ID,
  SEARCH_STEP_ID,
  WEB_SCRAPE_STEP_ID,
} from '../../constants/step-ids'
import { searchFlowStepDefinition } from '../../steps/search-step'
import { webScrapeFlowStepDefinition } from '../../steps/web-scrape-step'

describe('compileDsl', () => {
  describe('basic pipeline', () => {
    it('compiles a minimal pipeline with stage ids', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          { stage: 'thinking' },
          { stage: 'planning' },
          { stage: 'summary' },
          { stage: 'report' },
        ],
      }

      const result = compileDsl(dsl)
      expect(result.pipeline).toHaveLength(4)
      expect(result.pipeline.map((e) => e.id)).toEqual([
        THINKING_STEP_ID,
        PLANNING_STEP_ID,
        SUMMARY_STEP_ID,
        REPORT_STEP_ID,
      ])
      expect(result.conditionals).toHaveLength(0)
    })

    it('compiles a stage with a title override', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [{ stage: 'toolLoop', title: 'Execute Commands' }],
      }

      const result = compileDsl(dsl)
      expect(result.pipeline[0].config?.title).toBe('Execute Commands')
    })

    it('stages without expression or title have no config', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [{ stage: 'thinking' }],
      }

      const result = compileDsl(dsl)
      expect(result.pipeline[0].config).toBeUndefined()
    })
  })

  describe('expressions', () => {
    it('compiles system_msg and prompt into expressionPlan', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          {
            stage: 'planning',
            expression: {
              system_msg: 'You are a planner',
              prompt: 'Plan the task',
            },
          },
        ],
      }

      const result = compileDsl(dsl)
      const config = result.pipeline[0].config!
      expect(config.expressionPlan?.instructions).toBe('You are a planner')
      expect(config.expressionPlan?.userPrompt).toBe('Plan the task')
      expect(config.systemMessage).toBe('You are a planner')
      expect(config.userPrompt).toBe('Plan the task')
    })

    it('compiles tool and else_tool into stepTools', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          {
            stage: 'toolLoop',
            expression: {
              tool: 'web_scrape',
              else_tool: 'fallback_tool',
            },
          },
        ],
      }

      const result = compileDsl(dsl)
      const config = result.pipeline[0].config!
      expect(config.stepTools).toEqual(['web_scrape', 'fallback_tool'])
      expect(config.elseTool).toBe('fallback_tool')
      expect(config.expressionPlan?.tool).toBe('web_scrape')
      expect(config.expressionPlan?.elseTool).toBe('fallback_tool')
    })

    it('compiles else_goto into config', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          {
            stage: 'toolLoop',
            expression: {
              when: 'nonEmpty',
              else_goto: 'summary',
            },
          },
        ],
      }

      const result = compileDsl(dsl)
      const config = result.pipeline[0].config!
      expect(config.elseGoto).toBe(SUMMARY_STEP_ID)
      expect(config.expressionPlan?.elseGoto).toBe(SUMMARY_STEP_ID)
    })

    it('resolves when harness preset into a function', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          {
            stage: 'toolLoop',
            expression: { when: 'nonEmpty' },
          },
        ],
      }

      const result = compileDsl(dsl)
      const plan = result.pipeline[0].config!.expressionPlan!
      expect(plan.whenHarness).toBeTypeOf('function')
      expect(plan.whenHarness!({} as any, { text: 'hello' })).toBe(true)
      expect(plan.whenHarness!({} as any, { text: '' })).toBe(false)
    })

    it('resolves expression precondition preset', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          {
            stage: 'summary',
            expression: { precondition: 'hasToolLoop' },
          },
        ],
      }

      const result = compileDsl(dsl)
      const plan = result.pipeline[0].config!.expressionPlan!
      expect(plan.precondition).toBeTypeOf('function')
    })
  })

  describe('preconditions', () => {
    it('resolves a stage-level precondition into entry.when', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [{ stage: 'toolLoop', precondition: 'hasThinking' }],
      }

      const result = compileDsl(dsl)
      expect(result.pipeline[0].when).toBeTypeOf('function')
    })
  })

  describe('forEach', () => {
    it('compiles forEach with hasTodoItems preset', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          { stage: 'foreachItem', forEach: { preset: 'hasTodoItems' } },
        ],
      }

      const result = compileDsl(dsl)
      expect(result.pipeline[0].id).toBe(FOREACH_ITEM_STEP_ID)
      const config = result.pipeline[0].config!
      expect(config.foreachItem).toEqual({ preset: 'hasTodoItems' })
    })

    it('compiles forEach with startIndex', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          { stage: 'foreachItem', forEach: { preset: 'hasTodoItems', startIndex: 2 } },
        ],
      }

      const result = compileDsl(dsl)
      const config = result.pipeline[0].config!
      expect((config.foreachItem as any).startIndex).toBe(2)
    })

    it('compiles forEach with a per-item expression', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          {
            stage: 'foreachItem',
            forEach: {
              expression: { prompt: 'Execute this item', tool: 'run_command' },
            },
          },
        ],
      }

      const result = compileDsl(dsl)
      const config = result.pipeline[0].config!
      expect(config.foreachItem).toBeDefined()
      expect((config.foreachItem as any).itemsFrom).toBeTypeOf('function')
      expect((config.foreachItem as any).mode).toBe('expression')
      expect((config.foreachItem as any).expression).toBeDefined()
      expect((config.foreachItem as any).runItem).toBeUndefined()
    })
  })

  describe('webScrape', () => {
    it('compiles webScrape config and attaches the webScrape runner', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          { stage: 'search', search: { topic: 'otters' } },
          { stage: 'webScrape', webScrape: { maxItems: 3 } },
        ],
      }

      const result = compileDsl(dsl)
      expect(result.pipeline[1].id).toBe(WEB_SCRAPE_STEP_ID)
      expect(result.pipeline[1].config?.webScrape).toEqual({ maxItems: 3 })
      expect(result.pipeline[1].runner?.id).toBe(WEB_SCRAPE_STEP_ID)
    })

    it('compiles foreachItem webScrape preset', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          {
            stage: 'foreachItem',
            forEach: { preset: 'webScrape', maxItems: 2 },
          },
        ],
      }

      const result = compileDsl(dsl)
      expect(result.pipeline[0].config?.foreachItem).toEqual({
        preset: 'webScrape',
        maxItems: 2,
      })
    })
  })

  describe('search', () => {
    it('compiles search config and attaches the search runner', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          {
            stage: 'search',
            search: { topic: 'river otters', maxResults: 5 },
          },
        ],
      }

      const result = compileDsl(dsl)
      expect(result.pipeline[0].id).toBe(SEARCH_STEP_ID)
      expect(result.pipeline[0].config?.search).toEqual({
        topic: 'river otters',
        maxResults: 5,
      })
      expect(result.pipeline[0].runner).toBe(searchFlowStepDefinition)
    })
  })

  describe('conditionals', () => {
    it('compiles a conditional branch', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [
          { stage: 'thinking' },
          { stage: 'planning' },
          { stage: 'toolLoop' },
        ],
        conditionals: [
          {
            afterStage: 2,
            when: 'hasToolLoop',
            then: [{ stage: 'report' }],
            else: [{ stage: 'summary' }],
          },
        ],
      }

      const result = compileDsl(dsl)
      expect(result.conditionals).toHaveLength(1)

      const cond = result.conditionals[0]
      expect(cond.afterLinearIndex).toBe(2)
      expect(cond.when).toBeTypeOf('function')
      expect(cond.then).toHaveLength(1)
      expect(cond.then[0].id).toBe(REPORT_STEP_ID)
      expect(cond.else).toHaveLength(1)
      expect(cond.else[0].id).toBe(SUMMARY_STEP_ID)
    })

    it('conditional branches can have expressions', () => {
      const dsl: AgentFlowDsl = {
        pipeline: [{ stage: 'planning' }],
        conditionals: [
          {
            afterStage: 0,
            when: 'hasThinking',
            then: [
              { stage: 'toolLoop', expression: { prompt: 'Execute plan' } },
            ],
            else: [{ stage: 'report' }],
          },
        ],
      }

      const result = compileDsl(dsl)
      const thenEntry = result.conditionals[0].then[0]
      expect(thenEntry.config?.expressionPlan?.userPrompt).toBe('Execute plan')
    })
  })
})

describe('validateDsl', () => {
  it('passes for a valid minimal DSL', () => {
    expect(() =>
      validateDsl({ pipeline: [{ stage: 'thinking' }] }),
    ).not.toThrow()
  })

  it('throws for non-object input', () => {
    expect(() => validateDsl(null)).toThrow(DslValidationError)
    expect(() => validateDsl('string')).toThrow(DslValidationError)
  })

  it('throws when pipeline is missing', () => {
    expect(() => validateDsl({})).toThrow('must have a "pipeline" array')
  })

  it('throws for invalid stage id', () => {
    expect(() =>
      validateDsl({ pipeline: [{ stage: 'invalidStage' }] }),
    ).toThrow('pipeline[0].stage must be one of')
  })

  it('throws for non-object pipeline entry', () => {
    expect(() => validateDsl({ pipeline: ['not-an-object'] })).toThrow(
      'pipeline[0] must be an object',
    )
  })

  it('validates conditionals structure', () => {
    expect(() =>
      validateDsl({
        pipeline: [{ stage: 'thinking' }],
        conditionals: [{ afterStage: 'not-a-number', when: 'x', then: [], else: [] }],
      }),
    ).toThrow('conditionals[0].afterStage must be a number')
  })

  it('throws when conditional.when is not a string', () => {
    expect(() =>
      validateDsl({
        pipeline: [{ stage: 'thinking' }],
        conditionals: [{ afterStage: 0, when: 123, then: [], else: [] }],
      }),
    ).toThrow('conditionals[0].when must be a preset string')
  })
})
