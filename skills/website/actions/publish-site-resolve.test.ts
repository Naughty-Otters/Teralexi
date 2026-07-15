import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findPublishableSiteDirs, latestPublishableSiteDir } from './publish-site-resolve'

describe('publish-site-resolve', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'publish-site-resolve-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('prefers a workspace site over sandbox results', () => {
    const workspace = join(root, 'ws')
    const sandbox = join(root, 'sb')
    mkdirSync(join(workspace, 'public'), { recursive: true })
    writeFileSync(join(workspace, 'public', 'index.html'), '<html></html>')
    mkdirSync(join(sandbox, 'output', 'results', 'site-a'), { recursive: true })
    writeFileSync(
      join(sandbox, 'output', 'results', 'site-a', 'index.html'),
      '<html></html>',
    )

    expect(
      latestPublishableSiteDir({
        workspacePath: workspace,
        sandboxRoot: sandbox,
      }),
    ).toBe(join(workspace, 'public'))
  })

  it('falls back to sandbox output/results when workspace has no index', () => {
    const workspace = join(root, 'ws-empty')
    const sandbox = join(root, 'sb')
    mkdirSync(workspace, { recursive: true })
    mkdirSync(join(sandbox, 'output', 'results', 'dog-meetup'), {
      recursive: true,
    })
    writeFileSync(
      join(sandbox, 'output', 'results', 'dog-meetup', 'index.html'),
      '<html></html>',
    )

    const found = findPublishableSiteDirs({
      workspacePath: workspace,
      sandboxRoot: sandbox,
    })
    expect(found).toEqual([join(sandbox, 'output', 'results', 'dog-meetup')])
  })
})
