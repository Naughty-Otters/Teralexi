import { describe, expect, it } from 'vitest'
import { formatResearchFindingsMarkdown } from './format-findings'

describe('formatResearchFindingsMarkdown', () => {
  it('renders placeholder when there are no findings', () => {
    expect(formatResearchFindingsMarkdown('  ', [])).toBe(
      '# Research: (topic)\n\n_No findings recorded._',
    )
  })

  it('renders each finding with fallback for empty output', () => {
    const markdown = formatResearchFindingsMarkdown('Otters', [
      {
        question: 'What do otters eat?',
        output: '  Fish and crustaceans.  ',
        round: 1,
      },
      { question: 'Where do they live?', output: '   ', round: 2 },
    ])

    expect(markdown).toContain('# Research: Otters')
    expect(markdown).toContain('- What do otters eat?')
    expect(markdown).toContain('Fish and crustaceans.')
    expect(markdown).toContain('- Where do they live?')
    expect(markdown).toContain('_No substantive output recorded._')
  })
})
