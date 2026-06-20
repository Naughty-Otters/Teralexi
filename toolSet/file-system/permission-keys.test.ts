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
    expect(resolveFileToolPermissionKey('copy_file')).toEqual({
      key: 'edit',
      defaultAction: 'ask',
    })
    expect(resolveFileToolPermissionKey('delete_file')).toEqual({
      key: 'edit',
      defaultAction: 'ask',
    })
    expect(resolveFileToolPermissionKey('unknown')).toBeUndefined()
  })

  it('extracts expected path inputs per tool', () => {
    expect(extractFileToolPaths('read_file', { path: 'a.txt' })).toEqual([
      'a.txt',
    ])
    expect(extractFileToolPaths('delete_file', { path: 'gone.txt' })).toEqual([
      'gone.txt',
    ])
    expect(
      extractFileToolPaths('copy_file', { source: 'a', destination: 'b' }),
    ).toEqual(['a', 'b'])
    expect(
      extractFileToolPaths('move_file', { source: 'a', destination: 'b' }),
    ).toEqual(['a', 'b'])
    expect(extractFileToolPaths('apply_patch', { path: 'ignored' })).toEqual([])
  })

  it('ignores empty and non-string path values', () => {
    expect(extractFileToolPaths('write_file', { path: '' })).toEqual([])
    expect(extractFileToolPaths('edit_file', { path: 123 })).toEqual([])
    expect(extractFileToolPaths('glob_files', { path: '   ' })).toEqual([])
  })

  it('keeps registry stable for critical tools', () => {
    expect(FILE_TOOL_PERMISSION_KEYS['grep_files']).toMatchObject({
      key: 'grep',
      defaultAction: 'allow',
    })
    expect(FILE_TOOL_PERMISSION_KEYS['apply_patch']).toMatchObject({
      key: 'edit',
      defaultAction: 'ask',
    })
  })
})
