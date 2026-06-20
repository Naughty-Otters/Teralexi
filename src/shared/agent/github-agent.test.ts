import { describe, expect, it } from 'vitest'
import {
  GITHUB_SKILL_ID,
  agentIsGitHubAgent,
  githubComposerHint,
  skillIsGitHubAgent,
} from './github-agent'

describe('github-agent', () => {
  it('recognizes the GitHub skill id directly and from agent metadata', () => {
    expect(skillIsGitHubAgent(GITHUB_SKILL_ID)).toBe(true)
    expect(skillIsGitHubAgent(' github ')).toBe(true)
    expect(skillIsGitHubAgent('coding')).toBe(false)

    expect(agentIsGitHubAgent({ skillId: ' github ' })).toBe(true)
    expect(agentIsGitHubAgent({ id: 'skill:github' })).toBe(true)
    expect(agentIsGitHubAgent({ id: 'skill:coding' })).toBe(false)
    expect(agentIsGitHubAgent(null)).toBe(false)
  })

  it('does not show in-app OAuth composer hints while GitHub account OAuth is disabled', () => {
    expect(
      githubComposerHint({
        agentIsGitHub: true,
        isSignedIn: false,
        hasSkillAccess: false,
      }),
    ).toBeNull()

    expect(
      githubComposerHint({
        agentIsGitHub: true,
        isSignedIn: true,
        hasSkillAccess: false,
      }),
    ).toBeNull()

    expect(
      githubComposerHint({
        agentIsGitHub: true,
        isSignedIn: true,
        hasSkillAccess: true,
      }),
    ).toBeNull()

    expect(
      githubComposerHint({
        agentIsGitHub: false,
        isSignedIn: false,
        hasSkillAccess: false,
      }),
    ).toBeNull()
  })
})
