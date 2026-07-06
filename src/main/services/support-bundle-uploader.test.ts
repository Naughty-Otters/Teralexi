import { describe, expect, it } from 'vitest'
import {
  buildSupportUploadFormData,
  sanitizeSupportUploadLocation,
} from './support-bundle-uploader'

const manifest = {
  reportId: '550e8400-e29b-41d4-a716-446655440000',
  createdAt: '2026-06-29T12:00:00.000Z',
  appVersion: '0.0.1',
  platform: 'darwin',
  arch: 'arm64',
  electronVersion: '34.0.0',
  isPackaged: false,
  comments: 'App crashed after sending a message',
  includeSandbox: false,
  includeMemory: true,
}

describe('support-bundle-uploader', () => {
  it('sanitizeSupportUploadLocation accepts report ids and normalizes invalid input', () => {
    expect(
      sanitizeSupportUploadLocation('550e8400-e29b-41d4-a716-446655440000'),
    ).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(sanitizeSupportUploadLocation('support/report_1.zip')).toBe(
      'support-report_1.zip',
    )
  })

  it('builds multipart form with sanitized location and file fields', () => {
    const form = buildSupportUploadFormData({
      zipPath: '/tmp/teralexi-support-test.zip',
      zipBuffer: Buffer.from('zip-bytes'),
      reportId: '550e8400-e29b-41d4-a716-446655440000',
      comments: 'App crashed after sending a message',
      manifest,
    })

    expect(form.get('location')).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(form.get('comments')).toBe('App crashed after sending a message')
    expect(form.get('file')).toBeInstanceOf(Blob)
    expect(form.get('reportId')).toBe('550e8400-e29b-41d4-a716-446655440000')
  })
})
