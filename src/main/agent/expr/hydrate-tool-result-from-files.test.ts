import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach } from 'vitest'
import { hydrateToolResultFromOutputFiles } from './hydrate-tool-result-from-files'

describe('hydrateToolResultFromOutputFiles', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  it('reads written file when stdout and capture are empty', async () => {
    dir = join(tmpdir(), `hydrate-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, 'report.md')
    await writeFile(filePath, '# Report\n\nBody text here.', 'utf8')

    const out = (await hydrateToolResultFromOutputFiles(
      'write_file',
      {
        written: true,
        path: filePath,
        sandboxRoot: dir,
        stdout: '',
        resultContent: '(no stdout/stderr)',
      },
      dir,
    )) as Record<string, unknown>

    expect(typeof out.resultContent).toBe('string')
    expect(String(out.resultContent)).toContain('Report')
    expect(String(out.resultContent)).toContain('Body text here')
  })

  it('leaves meaningful resultContent unchanged', async () => {
    const out = await hydrateToolResultFromOutputFiles('run_script', {
      success: true,
      resultContent: 'already captured',
    })
    expect((out as Record<string, unknown>).resultContent).toBe('already captured')
  })
})
