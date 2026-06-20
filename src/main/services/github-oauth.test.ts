import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}))

vi.mock('node:https', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}))

vi.mock('@config/index', () => ({
  default: { github: { clientId: '', clientSecret: '' } },
}))

vi.mock('@config/github-oauth-defaults', () => ({
  BUNDLED_GITHUB_OAUTH_CLIENT_ID: '',
  BUNDLED_GITHUB_OAUTH_CLIENT_SECRET: '',
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeAccountsDir: vi.fn(() => '/accounts'),
}))

import {
  clearStoredAccount,
  githubAccountHasSkillAccess,
  githubMissingSkillScopes,
  GITHUB_SKILL_SCOPES,
  githubTokenEnv,
  loadStoredAccount,
  resolveGitHubOAuthCredentials,
} from './github-oauth'

describe('github-oauth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolveGitHubOAuthCredentials returns empty when not configured', () => {
    expect(resolveGitHubOAuthCredentials()).toEqual({
      clientId: '',
      clientSecret: '',
    })
  })

  it('githubAccountHasSkillAccess requires repo, read:org, and workflow', () => {
    expect(githubAccountHasSkillAccess(GITHUB_SKILL_SCOPES.join(' '))).toBe(true)
    expect(githubAccountHasSkillAccess('repo,read:org,workflow,gist')).toBe(true)
    expect(githubAccountHasSkillAccess('repo read:org workflow')).toBe(true)
    expect(githubAccountHasSkillAccess('repo,workflow')).toBe(false)
    expect(githubMissingSkillScopes('repo,workflow')).toEqual(['read:org'])
  })

  it('loadStoredAccount returns null when no file', () => {
    expect(loadStoredAccount()).toBeNull()
  })

  it('clearStoredAccount is safe when missing', () => {
    expect(() => clearStoredAccount()).not.toThrow()
  })

  it('githubTokenEnv returns empty when not signed in', () => {
    expect(githubTokenEnv()).toEqual({})
  })
})
