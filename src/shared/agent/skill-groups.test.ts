import { describe, expect, it } from 'vitest'
import {
  buildAgentPickerEntries,
  formatAgentGroupDisplayName,
  formatSkillSwitchHelpGrouped,
  parseSkillGroupFromFrontmatter,
} from './skill-groups'

const codingFamily = [
  {
    id: 'skill:coding',
    name: 'Coding',
    skillId: 'coding',
    skillGroup: 'coding',
    skillGroupLabel: 'Coding',
    skillVariant: 'implement',
    skillVariantLabel: 'Implement',
    skillGroupOrder: 1,
    skillVariantOrder: 1,
    enabled: true,
  },
  {
    id: 'skill:coding-review',
    name: 'Coding Review',
    skillId: 'coding-review',
    skillGroup: 'coding',
    skillGroupLabel: 'Coding',
    skillVariant: 'review',
    skillVariantLabel: 'Review',
    skillGroupOrder: 1,
    skillVariantOrder: 2,
    enabled: true,
  },
  {
    id: 'skill:default',
    name: 'Default',
    skillId: 'default',
    enabled: true,
  },
]

describe('skill-groups', () => {
  it('parses group metadata from frontmatter', () => {
    expect(
      parseSkillGroupFromFrontmatter({
        group: 'coding',
        group_label: 'Coding',
        variant: 'review',
        variant_label: 'Review',
        group_order: 1,
        variant_order: 2,
        group_primary: true,
      }),
    ).toEqual({
      skillGroup: 'coding',
      skillGroupLabel: 'Coding',
      skillVariant: 'review',
      skillVariantLabel: 'Review',
      skillGroupOrder: 1,
      skillVariantOrder: 2,
      skillGroupPrimary: true,
    })
  })

  it('formats grouped display names', () => {
    expect(
      formatAgentGroupDisplayName({
        name: 'Coding Review',
        skillGroup: 'coding',
        skillGroupLabel: 'Coding',
        skillVariant: 'review',
        skillVariantLabel: 'Review',
      }),
    ).toBe('Coding › Review')
    expect(formatAgentGroupDisplayName({ name: 'Default' })).toBe('Default')
  })

  it('builds picker entries with a coding group header', () => {
    const entries = buildAgentPickerEntries(codingFamily)
    expect(entries.some((entry) => entry.kind === 'header')).toBe(true)
    const header = entries.find((entry) => entry.kind === 'header')
    expect(header && header.kind === 'header' ? header.label : '').toBe('Coding')

    const variants = entries.filter((entry) => entry.kind === 'agent')
    expect(variants).toHaveLength(3)
    expect(
      variants.some(
        (entry) =>
          entry.kind === 'agent' && entry.option.shortLabel === 'Review',
      ),
    ).toBe(true)
  })

  it('formats grouped skill switch help', () => {
    const help = formatSkillSwitchHelpGrouped(codingFamily)
    expect(help).toContain('Coding:')
    expect(help).toContain('/skill:coding-review')
    expect(help).toContain('Coding › Review')
  })
})
