import { describe, expect, it } from 'vitest'
import { installExtensionFromGithub } from './install-extension-from-github'

describe('install-extension-from-github', () => {
  it('module exports installExtensionFromGithub', () => {
    expect(typeof installExtensionFromGithub).toBe('function')
  })

  it('rejects invalid GitHub URLs', async () => {
    const result = await installExtensionFromGithub({ url: 'not-a-repo' })
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) {
      expect(result.error).toMatch(/Invalid GitHub URL/i)
    }
  })
})
