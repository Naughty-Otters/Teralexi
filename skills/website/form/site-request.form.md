# Site Request

Collect site type, template, title, and data source before building.

**Keep `template_id` options in sync with `templates/manifest.json`.**

## Fields

| Field | Description |
|-------|-------------|
| `site_type` | Single-page or multi-page |
| `template_id` | Layout / style template from manifest |
| `site_title` | Site name / output folder slug |
| `data_source` | Where content comes from |
| `data_source_path` | Path to JSON or markdown (if applicable) |
| `extra_notes` | Tone, audience, sections to include |

<!-- FORM_SCHEMA
{
  "title": "What website would you like to build?",
  "message": "Pick a template for layout and style. Ensure a project folder is selected in the toolbar — the finished site will be promoted there after preview. You provide content in the next step.",
  "fields": [
    {
      "key": "site_type",
      "label": "Site type",
      "type": "select",
      "required": true,
      "options": [
        { "value": "single", "label": "Single page (landing, portfolio)" },
        { "value": "multi",  "label": "Multi-page (docs, small site)" }
      ]
    },
    {
      "key": "template_id",
      "label": "Template",
      "type": "select",
      "required": true,
      "options": [
        { "value": "landing-minimal",    "label": "Minimal landing" },
        { "value": "landing-portfolio",  "label": "Portfolio" },
        { "value": "docs-site",          "label": "Documentation site" }
      ]
    },
    {
      "key": "site_title",
      "label": "Site title",
      "type": "string",
      "required": true,
      "placeholder": "e.g. TaskFlow, Jane Doe Portfolio, API Docs"
    },
    {
      "key": "data_source",
      "label": "Where is the content?",
      "type": "select",
      "required": true,
      "options": [
        { "value": "inline",   "label": "I will type it in the next step" },
        { "value": "file",     "label": "It is in an existing file (JSON, markdown…)" },
        { "value": "generate", "label": "Generate realistic sample content" }
      ]
    },
    {
      "key": "data_source_path",
      "label": "File path (if using an existing file)",
      "type": "string",
      "required": false,
      "placeholder": "/Users/me/content.json"
    },
    {
      "key": "extra_notes",
      "label": "Extra instructions (optional)",
      "type": "text",
      "required": false,
      "placeholder": "e.g. developer audience, include pricing section, dark theme feel…"
    }
  ]
}
-->
