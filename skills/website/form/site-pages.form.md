# Multi-page site content

Content for the `docs-site` template and other multi-page layouts.

## Fields

| Field | Description |
|-------|-------------|
| `site_description` | Short site tagline for header/footer |
| `pages_outline` | One page per line: `slug | Page title` then indented sections as `  Section heading: body` |
| `nav_extra` | Optional extra nav items: `Label | filename.html` per line |
| `meta_description` | Default SEO description |

<!-- FORM_SCHEMA
{
  "title": "Multi-page site content",
  "message": "Define pages and section copy. The docs template adds shared navigation automatically.",
  "fields": [
    {
      "key": "site_description",
      "label": "Site tagline",
      "type": "string",
      "required": false,
      "placeholder": "API and guides for TaskFlow"
    },
    {
      "key": "pages_outline",
      "label": "Pages and sections",
      "type": "text",
      "required": true,
      "placeholder": "index | Home\n  Welcome: Getting started with the API.\n  Quick start: Install the CLI and run taskflow init.\nguide | Guide\n  Authentication: Use API keys from the dashboard."
    },
    {
      "key": "nav_extra",
      "label": "Extra nav items (optional)",
      "type": "text",
      "required": false,
      "placeholder": "GitHub | https://github.com/example"
    },
    {
      "key": "meta_description",
      "label": "Default page description",
      "type": "string",
      "required": false
    }
  ]
}
-->
