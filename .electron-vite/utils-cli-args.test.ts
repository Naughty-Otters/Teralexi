import { describe, expect, it } from 'vitest'
import { stripTeralexiCliArgs } from './utils'

describe('stripTeralexiCliArgs', () => {
  it('removes -m and its value before electron-builder', () => {
    expect(
      stripTeralexiCliArgs([
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
    expect(stripTeralexiCliArgs(['--dir', '-c', 'build.json'])).toEqual([
      '--dir',
      '-c',
      'build.json',
    ])
  })
})
