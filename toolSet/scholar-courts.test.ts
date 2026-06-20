import { describe, expect, it } from 'vitest'
import {
  buildGoogleScholarSearchUrl,
  describeScholarSearchScope,
  listScholarSearchOptions,
  resolveScholarAsSdt,
  resolveScholarState,
} from './scholar-courts'

describe('scholar-courts', () => {
  it('builds article search URL', () => {
    const url = buildGoogleScholarSearchUrl('machine learning', {
      category: 'article',
    })
    expect(url).toContain('scholar.google.com/scholar')
    expect(url).toContain('q=machine+learning')
    expect(url).toContain('as_sdt=0')
  })

  it('builds article URL with patents', () => {
    expect(
      resolveScholarAsSdt({ category: 'article', includePatents: true }),
    ).toBe('7')
    expect(describeScholarSearchScope({ category: 'article', includePatents: true })).toContain(
      'patents',
    )
  })

  it('builds case law federal URL', () => {
    const asSdt = resolveScholarAsSdt({ category: 'case_law_federal' })
    expect(asSdt).toBe('3')
    expect(describeScholarSearchScope({ category: 'case_law_federal' })).toContain(
      'federal',
    )
  })

  it('builds supreme court filter', () => {
    const asSdt = resolveScholarAsSdt({
      category: 'case_law',
      federalCourt: 'supreme_court',
    })
    expect(asSdt).toBe('4,180')
    expect(
      describeScholarSearchScope({
        category: 'case_law',
        federalCourt: 'supreme_court',
      }),
    ).toContain('Supreme Court')
  })

  it('resolves state by code and name', () => {
    expect(resolveScholarState('NY')?.asSdt).toBe('4,33')
    expect(resolveScholarState('new york')?.code).toBe('NY')
    expect(resolveScholarState('  ')).toBeUndefined()
    expect(resolveScholarState('Narnia')).toBeUndefined()
  })

  it('builds California state case law URL', () => {
    const url = buildGoogleScholarSearchUrl('negligence', {
      category: 'case_law_state',
      state: 'CA',
    })
    expect(url).toContain('as_sdt=4%2C5')
  })

  it('uses all state courts aggregate when case_law_state has no state', () => {
    expect(resolveScholarAsSdt({ category: 'case_law_state' })).toBe(
      'ffffffffffffe04',
    )
    expect(describeScholarSearchScope({ category: 'case_law_state' })).toContain(
      'all US state courts',
    )
  })

  it('narrows case_law by state', () => {
    expect(
      resolveScholarAsSdt({ category: 'case_law', state: 'TX' }),
    ).toBe('4,44')
    expect(
      describeScholarSearchScope({ category: 'case_law', state: 'Texas' }),
    ).toContain('Texas')
  })

  it('supports custom as_sdt', () => {
    expect(
      resolveScholarAsSdt({
        category: 'article',
        customAsSdt: '4,33,192',
      }),
    ).toBe('4,33,192')
    expect(
      describeScholarSearchScope({
        category: 'article',
        customAsSdt: '4,33,192',
      }),
    ).toContain('custom as_sdt')
  })

  it('lists search options', () => {
    const options = listScholarSearchOptions()
    expect(options.categories).toContain('case_law')
    expect(options.federalCourts.some((c) => c.key === 'ninth_circuit')).toBe(
      true,
    )
    expect(options.states).toHaveLength(51)
  })
})
