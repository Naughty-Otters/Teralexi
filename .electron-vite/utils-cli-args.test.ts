import { describe, expect, it } from 'vitest'
import { stripOpenFdeCliArgs } from './utils'

describe('stripOpenFdeCliArgs', () => {
  it('removes -m and its value before electron-builder', () => {
    expect(
      stripOpenFdeCliArgs([
        '-m',
        'prod',
        '-c',
        'build.json',
        '--mac',
        '--publish',
        'never',
      ]),
    ).toEqual(['-c', 'build.json', '--mac', '--publish', 'never'])
  })

  it('passes through electron-builder flags unchanged', () => {
    expect(stripOpenFdeCliArgs(['--dir', '-c', 'build.json'])).toEqual([
      '--dir',
      '-c',
      'build.json',
    ])
  })
})
