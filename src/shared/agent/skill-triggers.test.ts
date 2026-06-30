import { describe, expect, it } from 'vitest'
import {
  extractTriggerSection,
  formatSkillRoutingInstructionsBlock,
  mergeSkillRoutingEntries,
  resolveSkillGroupSiblingTargets,
} from './skill-triggers'

const CODING_REVIEW_TRIGGER = `Use when the user asks to:

- Review a PR, branch diff, or uncommitted changes
- Audit code quality

For fixes, suggest Coding.`

describe('extractTriggerSection', () => {
  it('extracts ### Trigger body until next heading or ---', () => {
    const md = `## Instructions

You are a reviewer.

### Trigger

${CODING_REVIEW_TRIGGER}

---

### Workflow

1. Scope`
    expect(extractTriggerSection(md)).toBe(CODING_REVIEW_TRIGGER)
  })

  it('returns null when no trigger section', () => {
    expect(extractTriggerSection('## Instructions\n\nNo trigger here.')).toBeNull()
  })
})

describe('resolveSkillGroupSiblingTargets', () => {
  const caller = {
    id: 'skill:coding',
    name: 'Coding',
    skillId: 'coding',
    skillGroup: 'coding',
    skillGroupLabel: 'Coding',
    skillVariant: 'implement',
    skillVariantLabel: 'Implement',
    skillVariantOrder: 1,
    skillsPrompt: '### Trigger\n\nImplement features.',
  }

  const siblings = [
    caller,
    {
      id: 'skill:coding-review',
      name: 'Coding Review',
      skillId: 'coding-review',
      skillGroup: 'coding',
      skillGroupLabel: 'Coding',
      skillVariant: 'review',
      skillVariantLabel: 'Review',
      skillVariantOrder: 2,
      skillsPrompt: `### Trigger\n\n${CODING_REVIEW_TRIGGER}`,
      description: 'Read-only review',
    },
    {
      id: 'skill:coding-pr',
      name: 'Coding PR',
      skillId: 'coding-pr',
      skillGroup: 'coding',
      skillVariant: 'pr',
      skillVariantOrder: 3,
      skillsPrompt: '### Trigger\n\nUse for PR workflows.',
    },
  ]

  it('returns other group members sorted by variant order', () => {
    const targets = resolveSkillGroupSiblingTargets(caller, siblings)
    expect(targets.map((t) => t.agentId)).toEqual([
      'skill:coding-review',
      'skill:coding-pr',
    ])
    expect(targets[0]?.trigger).toContain('Review a PR')
    expect(targets[0]?.canSwitch).toBe(true)
    expect(targets[0]?.canInvoke).toBe(false)
  })

  it('excludes caller and disabled agents', () => {
    const targets = resolveSkillGroupSiblingTargets(caller, [
      caller,
      { ...siblings[1]!, enabled: false },
    ])
    expect(targets).toHaveLength(0)
  })
})

describe('mergeSkillRoutingEntries', () => {
  it('merges invoke flags onto variant entries', () => {
    const merged = mergeSkillRoutingEntries(
      [
        {
          agentId: 'skill:coding-review',
          skillId: 'coding-review',
          displayName: 'Coding › Review',
          description: 'Review',
          trigger: 'Review only',
          canSwitch: true,
          canInvoke: false,
        },
      ],
      [
        {
          agentId: 'skill:coding-review',
          skillId: 'coding-review',
          displayName: 'Coding › Review',
          description: 'Review agent',
          trigger: null,
          canSwitch: false,
          canInvoke: true,
        },
      ],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.canSwitch).toBe(true)
    expect(merged[0]?.canInvoke).toBe(true)
  })
})

describe('formatSkillRoutingInstructionsBlock', () => {
  it('includes triggers and routing hints', () => {
    const block = formatSkillRoutingInstructionsBlock(
      [
        {
          agentId: 'skill:coding-review',
          skillId: 'coding-review',
          displayName: 'Coding › Review',
          description: 'Review',
          trigger: '- Review a PR',
          canSwitch: true,
          canInvoke: true,
        },
      ],
      { hasInvokeAgent: true, groupLabel: 'Coding' },
    )
    expect(block).toContain('### Related skills & sub-agents')
    expect(block).toContain('Coding › Review')
    expect(block).toContain('/skill:coding-review')
    expect(block).toContain('invoke_agent')
    expect(block).toContain('- Review a PR')
  })
})
