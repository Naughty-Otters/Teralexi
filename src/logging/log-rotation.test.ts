import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createRotatingPinoFileDestination,
  rotateLogFiles,
  shouldRotateLogFile,
} from './log-rotation'

describe('log-rotation', () => {
  let tempDir = ''

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  it('rotates numbered archives and drops the oldest file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'log-rotation-'))
    const base = join(tempDir, 'main.log')
    writeFileSync(base, 'active')
    writeFileSync(`${base}.1`, 'one')
    writeFileSync(`${base}.2`, 'two')
    writeFileSync(`${base}.3`, 'three')

    rotateLogFiles(base, 5)

    expect(readFileSync(`${base}.1`, 'utf8')).toBe('active')
    expect(readFileSync(`${base}.2`, 'utf8')).toBe('one')
    expect(readFileSync(`${base}.3`, 'utf8')).toBe('two')
    expect(readFileSync(`${base}.4`, 'utf8')).toBe('three')
    expect(() => readFileSync(base, 'utf8')).toThrow()
  })

  it('detects when a file exceeds the size threshold', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'log-rotation-'))
    const base = join(tempDir, 'main.log')
    writeFileSync(base, '12345')

    expect(shouldRotateLogFile(base, 10)).toBe(false)
    expect(shouldRotateLogFile(base, 5)).toBe(true)
  })

  it('creates a new active file after rotation during writes', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'log-rotation-'))
    const base = join(tempDir, 'main.log')
    writeFileSync(base, 'x'.repeat(20))

    const destination = createRotatingPinoFileDestination(base, {
      maxBytes: 10,
      maxFiles: 3,
    })

    destination.write('next-line\n')
    destination.end?.()

    expect(readFileSync(`${base}.1`, 'utf8')).toBe('x'.repeat(20))
    expect(readFileSync(base, 'utf8')).toBe('next-line\n')
    expect(statSync(base).size).toBe('next-line\n'.length)
  })
})
