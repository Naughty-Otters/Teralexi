import { describe, expect, it } from 'vitest'
import { extractThreadTag, extractTopThreadTags, scoreThreadTags } from './thread-tagger'

describe('extractThreadTag', () => {
  it('tags auth-related content', () => {
    expect(extractThreadTag('How does the login flow work?')).toBe('auth')
    expect(extractThreadTag('JWT token validation and session management')).toBe('auth')
    expect(extractThreadTag('OAuth SSO integration with the identity provider')).toBe('auth')
  })

  it('tags database-related content', () => {
    expect(extractThreadTag('SQL migration for the users table schema')).toBe('database')
    expect(extractThreadTag('Add an index to the messages repository query')).toBe('database')
  })

  it('tags testing-related content', () => {
    expect(extractThreadTag('Write a vitest unit test with mocks for the auth module')).toBe('testing')
    // "failing" triggers the error pattern; multi-signal content may resolve to either
    const failingTestTag = extractThreadTag('Fix the failing integration test suite')
    expect(['testing', 'error']).toContain(failingTestTag)
  })

  it('tags UI-related content', () => {
    expect(extractThreadTag('The React component renders incorrectly, fix the CSS layout')).toBe('ui')
    expect(extractThreadTag('Add a new modal dialog with form input')).toBe('ui')
  })

  it('tags API-related content', () => {
    expect(extractThreadTag('Create a new REST endpoint for the GraphQL handler')).toBe('api')
  })

  it('tags build-related content', () => {
    expect(extractThreadTag('TypeScript compilation fails in the webpack bundle')).toBe('build')
  })

  it('tags error-related content', () => {
    expect(extractThreadTag('Debug the crash: undefined is not a function')).toBe('error')
    expect(extractThreadTag('Fix the exception thrown in the failing test')).toBe('error')
  })

  it('tags performance-related content', () => {
    expect(extractThreadTag('Optimize the slow database query — cache the result')).toBe('performance')
  })

  it('detects auth from file path', () => {
    expect(extractThreadTag('Read /src/auth/login.ts and fix the bug')).toBe('auth')
  })

  it('detects testing from file extension', () => {
    const scores = scoreThreadTags('update the function in auth.test.ts')
    const tags = scores.map((s) => s.tag)
    expect(tags).toContain('testing')
  })

  it('falls back to general for untaggable content', () => {
    expect(extractThreadTag('hello')).toBe('general')
    expect(extractThreadTag('')).toBe('general')
  })
})

describe('extractTopThreadTags', () => {
  it('returns up to N tags', () => {
    const tags = extractTopThreadTags('unit test for authentication login', 2)
    expect(tags.length).toBeLessThanOrEqual(2)
    expect(tags.length).toBeGreaterThanOrEqual(1)
  })

  it('puts the strongest signal first', () => {
    // "test" appears multiple times, "auth" once
    const tags = extractTopThreadTags('unit test test testing the test suite')
    expect(tags[0]).toBe('testing')
  })
})

describe('scoreThreadTags', () => {
  it('returns scores in descending order', () => {
    const scores = scoreThreadTags('test the login form component')
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i].score).toBeLessThanOrEqual(scores[i - 1].score)
    }
  })

  it('returns general with score 0 for empty input', () => {
    const scores = scoreThreadTags('')
    expect(scores).toEqual([{ tag: 'general', score: 0 }])
  })
})
