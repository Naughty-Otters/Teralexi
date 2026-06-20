import { describe, expect, it } from 'vitest'
import { RUN_SCRIPT_TOOLS } from '@shared/constants'

describe('RUN_SCRIPT_TOOLS', () => {
  it('exposes legacy and split tool names', () => {
    expect(RUN_SCRIPT_TOOLS.LEGACY).toBe('run_script')
    expect(RUN_SCRIPT_TOOLS.CONTENT).toBe('run_script')
    expect(RUN_SCRIPT_TOOLS.FILE).toBe('run_script_file')
  })
})
