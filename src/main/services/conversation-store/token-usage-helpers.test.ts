import { describe, expect, it } from 'vitest'
import { last30DaysRange } from '@shared/token-usage-calendar'
import {
  buildTokenUsageDashboard,
  eachUtcDayInRange,
  tokenUsageSeriesKey,
} from './token-usage-helpers'

describe('buildTokenUsageDashboard', () => {
  it('builds overview, model totals, and daily stacked segments', () => {
    const dashboard = buildTokenUsageDashboard({
      since: '2026-06-01T00:00:00.000Z',
      until: '2026-06-03T23:59:59.000Z',
      overview: {
        sessions: 2,
        messages: 5,
        total_tokens: 300,
        active_days: 2,
      },
      dailyRows: [
        {
          day: '2026-06-01',
          provider: 'anthropic',
          model: 'claude-sonnet',
          total_tokens: 100,
        },
        {
          day: '2026-06-01',
          provider: 'openai',
          model: 'gpt-4o',
          total_tokens: 50,
        },
        {
          day: '2026-06-03',
          provider: 'anthropic',
          model: 'claude-sonnet',
          total_tokens: 150,
        },
      ],
    })

    expect(dashboard.overview).toEqual({
      sessions: 2,
      messages: 5,
      totalTokens: 300,
      activeDays: 2,
    })

    expect(dashboard.models).toHaveLength(2)
    expect(dashboard.models[0]?.label).toContain('claude-sonnet')
    expect(dashboard.models[0]?.totalTokens).toBe(250)

    expect(dashboard.dailyBars).toHaveLength(3)
    expect(dashboard.dailyBars[0]?.date).toBe('2026-06-01')
    expect(dashboard.dailyBars[0]?.totalTokens).toBe(150)
    expect(dashboard.dailyBars[0]?.segments).toHaveLength(2)
    expect(dashboard.dailyBars[1]?.date).toBe('2026-06-02')
    expect(dashboard.dailyBars[1]?.totalTokens).toBe(0)
    expect(dashboard.dailyBars[2]?.totalTokens).toBe(150)
  })

  it('uses stable series keys for model segments', () => {
    const dashboard = buildTokenUsageDashboard({
      since: '2026-06-01T00:00:00.000Z',
      until: '2026-06-01T23:59:59.000Z',
      overview: {
        sessions: 1,
        messages: 1,
        total_tokens: 10,
        active_days: 1,
      },
      dailyRows: [
        {
          day: '2026-06-01',
          provider: 'anthropic',
          model: 'claude-sonnet',
          total_tokens: 10,
        },
      ],
    })

    const key = tokenUsageSeriesKey('anthropic', 'claude-sonnet')
    expect(dashboard.dailyBars[0]?.segments[0]?.seriesKey).toBe(key)
  })
})

describe('eachUtcDayInRange', () => {
  it('returns inclusive UTC day keys', () => {
    expect(
      eachUtcDayInRange('2026-06-01T12:00:00.000Z', '2026-06-03T08:00:00.000Z'),
    ).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })
})

describe('last30DaysRange', () => {
  it('spans through today', () => {
    const range = last30DaysRange()
    expect(range.since < range.until).toBe(true)
  })
})
