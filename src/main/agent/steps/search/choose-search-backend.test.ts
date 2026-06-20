import { describe, expect, it } from 'vitest'
import { chooseSearchBackend } from './choose-search-backend'

describe('chooseSearchBackend', () => {
  it('forces web when mode is web', () => {
    expect(chooseSearchBackend('systematic review of CRISPR', 'web').backend).toBe(
      'web',
    )
  })

  it('forces scholar when mode is scholar', () => {
    expect(chooseSearchBackend('best pizza near me', 'scholar').backend).toBe(
      'scholar',
    )
  })

  it('routes academic queries to scholar in auto mode', () => {
    const choice = chooseSearchBackend(
      'peer-reviewed meta-analysis of GLP-1 agonists',
      'auto',
    )
    expect(choice.backend).toBe('scholar')
    expect(choice.scope.category).toBe('article')
  })

  it('routes case law queries to scholar with case scope', () => {
    const choice = chooseSearchBackend(
      'Supreme Court precedent on software patents',
      'auto',
    )
    expect(choice.backend).toBe('scholar')
    expect(choice.scope.category).toMatch(/case_law/)
  })

  it('routes news-style queries to web in auto mode', () => {
    const choice = chooseSearchBackend(
      'latest news on OpenAI product release this week',
      'auto',
    )
    expect(choice.backend).toBe('web')
  })
})
