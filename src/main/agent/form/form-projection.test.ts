import { describe, expect, it } from 'vitest'
import {
  coerceProjectionString,
  FORM_PROJECTION_ARTIFACT_DEFAULT,
  getJsonPathValue,
  normalizeJsonPath,
  parseJsonObjectFromContent,
} from './form-projection'

describe('form-projection', () => {
  it('exposes default projection artifact name', () => {
    expect(FORM_PROJECTION_ARTIFACT_DEFAULT).toBe('form-projection.json')
  })

  it('normalizeJsonPath strips leading $', () => {
    expect(normalizeJsonPath('$.options.tag')).toBe('options.tag')
    expect(normalizeJsonPath('title')).toBe('title')
  })

  it('getJsonPathValue reads nested projection fields', () => {
    const root = {
      title: 'Pick a tag',
      message: 'From step 1',
      options: { tag_filter: ['life', 'love'] },
    }
    expect(getJsonPathValue(root, '$.title')).toBe('Pick a tag')
    expect(getJsonPathValue(root, 'options.tag_filter')).toEqual([
      'life',
      'love',
    ])
  })

  it('getJsonPathValue returns undefined for invalid paths', () => {
    expect(getJsonPathValue({ a: 1 }, '')).toBeUndefined()
    expect(getJsonPathValue({ a: 1 }, 'a.b.c')).toBeUndefined()
    expect(getJsonPathValue(null, 'title')).toBeUndefined()
    expect(getJsonPathValue({ options: { tag: 'x' } }, 'options..tag')).toBeUndefined()
  })

  it('parseJsonObjectFromContent accepts fenced json and raw json', () => {
    expect(parseJsonObjectFromContent('```json\n{"title":"Hello"}\n```')).toEqual({
      title: 'Hello',
    })
    expect(parseJsonObjectFromContent('{"title":"Raw"}')).toEqual({ title: 'Raw' })
    expect(parseJsonObjectFromContent('not-json')).toBeNull()
    expect(parseJsonObjectFromContent('["array"]')).toBeNull()
  })

  it('coerceProjectionString handles strings and numbers only', () => {
    expect(coerceProjectionString(42)).toBe('42')
    expect(coerceProjectionString('  hi ')).toBe('hi')
    expect(coerceProjectionString('   ')).toBeUndefined()
    expect(coerceProjectionString({})).toBeUndefined()
    expect(coerceProjectionString(Number.NaN)).toBeUndefined()
  })
})
