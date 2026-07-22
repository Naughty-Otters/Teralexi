import { describe, expect, it } from 'vitest'
import {
  extractFileToolPaths,
  FILE_TOOL_PERMISSION_KEYS,
  resolveFileToolPermissionKey,
} from './permission-keys'

describe('permission-keys', () => {
  it('resolves known file tool permissions', () => {
    expect(resolveFileToolPermissionKey('read_file')).toEqual({
      key: 'read',
      defaultAction: 'allow',
    })
    expect(resolveFileToolPermissionKey('edit_files')).toEqual({
      key: 'edit',
      defaultAction: 'ask',
    })
    expect(resolveFileToolPermissionKey('shell')).toEqual({
      key: 'external_path',
      defaultAction: 'ask',
    })
    expect(resolveFileToolPermissionKey('unknown')).toBeUndefined()
  })

  it('extracts expected path inputs per tool', () => {
    expect(extractFileToolPaths('read_file', { path: 'a.txt' })).toEqual([
      'a.txt',
    ])
    expect(
      extractFileToolPaths('edit_files', { mode: 'replace', path: 'gone.txt' }),
    ).toEqual(['gone.txt'])
    expect(
      extractFileToolPaths('promote_artifact', { from: 'a', to: 'b' }),
    ).toEqual(['a', 'b'])
    expect(
      extractFileToolPaths('edit_files', { mode: 'patch', path: 'ignored' }),
    ).toEqual([])
  })

  it('ignores empty and non-string path values', () => {
    expect(extractFileToolPaths('edit_files', { mode: 'write', path: '' })).toEqual(
      [],
    )
    expect(extractFileToolPaths('edit_files', { mode: 'replace', path: 123 })).toEqual(
      [],
    )
  })

  it('keeps registry stable for critical tools', () => {
    expect(FILE_TOOL_PERMISSION_KEYS['edit_files']).toMatchObject({
      key: 'edit',
      defaultAction: 'ask',
    })
    expect(FILE_TOOL_PERMISSION_KEYS['shell']).toMatchObject({
      key: 'external_path',
      defaultAction: 'ask',
    })
  })
})
