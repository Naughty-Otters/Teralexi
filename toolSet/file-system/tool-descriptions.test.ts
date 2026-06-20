import { describe, expect, it } from 'vitest'
import { WORKSPACE_PATH_HINT } from './constants'
import { listFiles, readFile } from './index'

describe('file tool descriptions', () => {
  it('workspace tools use WORKSPACE_PATH_HINT and avoid sandbox-first wording', () => {
    for (const tool of [readFile, listFiles]) {
      expect(tool.description).toContain('user project')
      expect(tool.description).toContain(WORKSPACE_PATH_HINT.slice(0, 40))
      expect(tool.description.toLowerCase()).not.toContain('sandbox workspace')
    }
  })
})
