import { describe, expect, it } from 'vitest'
import {
  normalizeFormToSiteData,
  normalizeRawToSiteData,
  validateSiteData,
} from './normalize-data'
import type { TemplateManifestEntry } from './types'

const singleTemplate: TemplateManifestEntry = {
  id: 'portfolio',
  label: 'Portfolio',
  site_types: ['single'],
  schema: 'single',
  renderer: 'single',
  style: { theme: 'minimal' },
}

const multiTemplate: TemplateManifestEntry = {
  id: 'docs-site',
  label: 'Docs Site',
  site_types: ['multi'],
  schema: 'multi',
  renderer: 'multi',
}

describe('website normalize-data', () => {
  it('normalizes single-page form fields with nav and hero', () => {
    const data = normalizeFormToSiteData(
      singleTemplate,
      {
        site_title: 'My Portfolio',
        headline: 'Hello',
        subheadline: 'Designer',
        cta_label: 'Contact',
        cta_href: '#contact',
        sections_outline: 'About: I build products\nWork: Case study one | Case study two',
        projects_outline: 'Project A: Description | https://example.com/a',
        contact_email: 'hello@example.com',
      },
      'Portfolio',
    )

    expect(data.title).toBe('My Portfolio')
    expect(data.hero).toMatchObject({
      headline: 'Hello',
      subheadline: 'Designer',
      cta: { label: 'Contact', href: '#contact' },
    })
    expect(data.sections?.[0]).toMatchObject({
      id: 'about',
      heading: 'About',
      body: 'I build products',
    })
    expect(data.sections?.[1]?.items).toEqual([
      { title: 'Case study one', body: '' },
      { title: 'Case study two', body: '' },
    ])
    expect(data.nav).toEqual([
      { label: 'About', href: '#about' },
      { label: 'Work', href: '#work' },
    ])
    expect(data.projects?.[0]).toEqual({
      title: 'Project A',
      description: 'Description',
      url: 'https://example.com/a',
    })
    expect(data.contact).toEqual({ email: 'hello@example.com' })
  })

  it('normalizes multi-page outline into pages and nav', () => {
    const data = normalizeFormToSiteData(
      multiTemplate,
      {
        site_title: 'Docs',
        pages_outline: [
          'index|Home',
          '  Intro: Welcome',
          'about|About',
          '  Team: Jane and John',
        ].join('\n'),
      },
      'Docs',
    )

    expect(data.pages).toEqual([
      {
        slug: 'index',
        title: 'Home',
        sections: [{ heading: 'Intro', body: 'Welcome' }],
      },
      {
        slug: 'about',
        title: 'About',
        sections: [{ heading: 'Team', body: 'Jane and John' }],
      },
    ])
    expect(data.nav).toEqual([
      { label: 'Home', href: 'index.html' },
      { label: 'About', href: 'about.html' },
    ])
  })

  it('requires pages_outline for multi-page templates', () => {
    expect(() =>
      normalizeFormToSiteData(multiTemplate, {}, 'Docs'),
    ).toThrow(/pages_outline is required/)
  })

  it('fills missing section ids when normalizing raw site data', () => {
    const data = normalizeRawToSiteData(
      singleTemplate,
      {
        sections: [{ heading: 'About Us', body: 'Welcome' }],
      },
      'Site',
    )

    expect(data.title).toBe('Site')
    expect(data.theme).toBe('minimal')
    expect(data.sections?.[0]?.id).toBe('about-us')
  })

  it('builds nav from raw sections that already have ids', () => {
    const data = normalizeRawToSiteData(
      singleTemplate,
      {
        sections: [{ id: 'about-us', heading: 'About Us', body: 'Welcome' }],
      },
      'Site',
    )

    expect(data.nav).toEqual([{ label: 'About Us', href: '#about-us' }])
  })

  it('validates site data requirements', () => {
    expect(validateSiteData(singleTemplate, { title: '' })).toBe(
      'site.json: title is required',
    )
    expect(
      validateSiteData(multiTemplate, { title: 'Docs', pages: [] }),
    ).toBe('site.json: pages array is required for multi-page templates')
    expect(
      validateSiteData(singleTemplate, { title: 'Site', sections: [] }),
    ).toBe(
      'site.json: hero.headline or sections required for single-page templates',
    )
  })
})
