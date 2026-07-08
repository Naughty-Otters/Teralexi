# Landing page content

Content for single-page templates (`landing-minimal`, `landing-portfolio`).

## Fields

| Field | Description |
|-------|-------------|
| `headline` | Hero headline |
| `subheadline` | Hero supporting line |
| `cta_label` | Primary button label |
| `cta_href` | Primary button link (`#section` or URL) |
| `sections_outline` | One section per line: `Heading: body` or `Heading: item1 | item2` for feature bullets |
| `projects_outline` | Portfolio only — one per line: `Title: description | url` |
| `contact_email` | Optional contact email |
| `meta_description` | SEO description |

<!-- FORM_SCHEMA
{
  "title": "Landing page content",
  "message": "Provide hero copy and sections. Styling comes from the template.",
  "fields": [
    {
      "key": "headline",
      "label": "Hero headline",
      "type": "string",
      "required": true,
      "placeholder": "Ship static sites in minutes"
    },
    {
      "key": "subheadline",
      "label": "Hero subheadline",
      "type": "text",
      "required": false,
      "placeholder": "Short supporting sentence"
    },
    {
      "key": "cta_label",
      "label": "Primary button label",
      "type": "string",
      "required": false,
      "placeholder": "Get started"
    },
    {
      "key": "cta_href",
      "label": "Primary button link",
      "type": "string",
      "required": false,
      "placeholder": "#contact"
    },
    {
      "key": "sections_outline",
      "label": "Sections (one per line)",
      "type": "text",
      "required": true,
      "placeholder": "Features: Fast setup | No build step | Preview in app\nAbout: We help teams ship landing pages."
    },
    {
      "key": "projects_outline",
      "label": "Projects (portfolio template, one per line)",
      "type": "text",
      "required": false,
      "placeholder": "OpenFDE: Desktop agent app | https://github.com/example"
    },
    {
      "key": "contact_email",
      "label": "Contact email",
      "type": "string",
      "required": false
    },
    {
      "key": "meta_description",
      "label": "Page description (SEO)",
      "type": "string",
      "required": false
    }
  ]
}
-->
