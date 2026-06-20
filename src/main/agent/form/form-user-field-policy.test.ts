import { describe, expect, it } from 'vitest'
import {
  filterToUserFacingFormFields,
  isUserFacingFormField,
} from './form-user-field-policy'

describe('isUserFacingFormField', () => {
  it('allows typical user inputs', () => {
    expect(isUserFacingFormField({ key: 'doc_type', label: 'Document type' })).toBe(
      true,
    )
    expect(
      isUserFacingFormField({ key: 'data_source_path', label: 'Path to data file' }),
    ).toBe(true)
    expect(isUserFacingFormField({ key: 'doc_title', label: 'Report title' })).toBe(
      true,
    )
  })

  it('rejects verification and execution metadata', () => {
    expect(
      isUserFacingFormField({ key: 'success_criteria', label: 'Success criteria' }),
    ).toBe(false)
    expect(
      isUserFacingFormField({ key: 'how_to_verify', label: 'How to verify this step' }),
    ).toBe(false)
    expect(
      isUserFacingFormField({
        key: 'execution_mode',
        label: 'Execution decision',
      }),
    ).toBe(false)
    expect(
      isUserFacingFormField({ key: 'context', label: 'Execution context' }),
    ).toBe(false)
    expect(
      isUserFacingFormField({
        key: 'confirm_run',
        label: 'Confirm execution before tools',
      }),
    ).toBe(false)
  })
})

describe('filterToUserFacingFormFields', () => {
  it('keeps only user-facing fields', () => {
    const out = filterToUserFacingFormFields([
      { key: 'doc_type', label: 'Document type' },
      { key: 'verification_method', label: 'How to verify' },
      { key: 'doc_title', label: 'Title' },
    ])
    expect(out.map((f) => f.key)).toEqual(['doc_type', 'doc_title'])
  })
})
