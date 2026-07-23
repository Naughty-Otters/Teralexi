import { describe, expect, it } from 'vitest'
import { WORKSPACE_PATH_HINT } from './constants'
import { editFiles, readFile, shell } from './index'

describe('file tool descriptions', () => {
  it('workspace tools use WORKSPACE_PATH_HINT and avoid sandbox-first wording', () => {
    for (const tool of [readFile, editFiles]) {
      expect(tool.description.toLowerCase()).toMatch(/project/)
      expect(tool.description).toContain(WORKSPACE_PATH_HINT.slice(0, 40))
      expect(tool.description.toLowerCase()).not.toContain('sandbox workspace')
    }
    expect(shell.description.length).toBeGreaterThan(0)
  })
})
