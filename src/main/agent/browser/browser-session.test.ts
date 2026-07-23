import { describe, expect, it } from 'vitest'
import { searchKeysFromSelectedElement } from '@main/agent/browser/browser-session'

describe('searchKeysFromSelectedElement', () => {
  it('collects testid, id, classes, and text', () => {
    const keys = searchKeysFromSelectedElement({
      ref: 'e1',
      tag: 'button',
      id: 'save-btn',
      className: 'btn primary',
      text: 'Save changes',
      testId: 'save-button',
      selector: 'button#save-btn',
      htmlSnippet: '<button id="save-btn">Save changes</button>',
      styles: {},
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    })
    expect(keys).toEqual(
      expect.arrayContaining([
        'save-button',
        'save-btn',
        'btn',
        'primary',
        'Save changes',
        'button',
      ]),
    )
  })
})
