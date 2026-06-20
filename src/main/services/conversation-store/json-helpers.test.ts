import { describe, expect, it } from 'vitest'
import {
  normalizeToolApprovalOverrides,
  parseJsonObject,
  parseJsonStringArray,
  parseJsonStringArrayOrNull,
  parseJsonToolApprovalOverrides,
} from './json-helpers'

describe('json-helpers', () => {
  it('parseJsonObject keeps string values only', () => {
    expect(parseJsonObject('{"a":"x","b":1}')).toEqual({ a: 'x' })
    expect(parseJsonObject('[]')).toEqual({})
    expect(parseJsonObject('not-json')).toEqual({})
  })

  it('parseJsonStringArray filters strings', () => {
    expect(parseJsonStringArray('["a",1,"b"]')).toEqual(['a', 'b'])
    expect(parseJsonStringArray('{}')).toEqual([])
  })

  it('parseJsonStringArrayOrNull handles null and invalid', () => {
    expect(parseJsonStringArrayOrNull('null')).toBeNull()
    expect(parseJsonStringArrayOrNull('["x"]')).toEqual(['x'])
    expect(parseJsonStringArrayOrNull('bad')).toBeNull()
  })

  it('parseJsonToolApprovalOverrides keeps booleans', () => {
    expect(parseJsonToolApprovalOverrides('{"t":true,"n":1}')).toEqual({
      t: true,
    })
    expect(parseJsonToolApprovalOverrides(undefined)).toEqual({})
  })

  it('normalizeToolApprovalOverrides sorts keys', () => {
    expect(normalizeToolApprovalOverrides({ b: true, a: false })).toEqual({
      a: false,
      b: true,
    })
    expect(normalizeToolApprovalOverrides(undefined)).toEqual({})
  })
})
