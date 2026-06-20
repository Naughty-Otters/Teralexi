import { describe, expect, it } from 'vitest'
import { FILE_CHANGE_TOOL_NAMES, isFileChangeToolName } from './types'

describe('file-change types', () => {
  it('recognizes registered file-change tool names', () => {
    for (const name of FILE_CHANGE_TOOL_NAMES) {
      expect(isFileChangeToolName(name)).toBe(true)
    }
    expect(isFileChangeToolName('read_file')).toBe(false)
  })
})
