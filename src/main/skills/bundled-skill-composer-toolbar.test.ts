import { describe, expect, it } from 'vitest'
import { getBundledSkillComposerToolbarPlugins } from './bundled-skill-actions'

describe('bundled skill composer toolbar plugins', () => {
  it('registers publish button for the website skill', () => {
    const plugins = getBundledSkillComposerToolbarPlugins('website')
    expect(plugins.map((p) => p.id)).toEqual(['publish-website'])
    expect(plugins[0]?.icon).toBe('globe')
    expect(plugins[0]?.label).toBe('Publish website')
    expect(typeof plugins[0]?.preview).toBe('function')
    expect(typeof plugins[0]?.execute).toBe('function')
  })

  it('returns empty for skills without toolbar plugins', () => {
    expect(getBundledSkillComposerToolbarPlugins('coding')).toEqual([])
    expect(getBundledSkillComposerToolbarPlugins('documents')).toEqual([])
  })
})
