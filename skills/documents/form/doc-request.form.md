# Document Request

Collect what the user wants to create, which template to use, and where the data comes from before generating any document.

**Keep `template_id` options in sync with `templates/manifest.json`.**

## Fields

| Field | Description |
|-------|-------------|
| `doc_type` | Type of document to create |
| `template_id` | Layout / style template from manifest |
| `doc_title` | Title / filename for the document |
| `data_source` | Where the data lives |
| `data_source_path` | Path to an existing file (if applicable) |
| `extra_notes` | Any extra content instructions (not styling — use template_id for look) |

<!-- FORM_SCHEMA
{
  "title": "What would you like to create?",
  "message": "Pick a document type and template. Styling comes from the template — you only provide content in the next step.",
  "fields": [
    {
      "key": "doc_type",
      "label": "Document type",
      "type": "select",
      "required": true,
      "options": [
        { "value": "pdf",        "label": "📄 PDF report (.pdf)" },
        { "value": "excel",        "label": "📊 Excel spreadsheet (.xlsx)" },
        { "value": "powerpoint",   "label": "📽️ PowerPoint presentation (.pptx)" },
        { "value": "word",         "label": "📝 Word document (.docx)" }
      ]
    },
    {
      "key": "template_id",
      "label": "Template (layout & style)",
      "type": "select",
      "required": true,
      "options": [
        { "value": "corporate-report-pdf", "label": "Corporate report (PDF)" },
        { "value": "sales-dashboard",      "label": "Sales dashboard (Excel)" },
        { "value": "navy-roadmap-deck",    "label": "Navy roadmap deck (PowerPoint)" },
        { "value": "formal-brief",         "label": "Formal brief (Word)" }
      ]
    },
    {
      "key": "doc_title",
      "label": "Document title / filename",
      "type": "string",
      "required": true,
      "placeholder": "e.g. Q1 Sales Report, Team Roadmap, Project Brief"
    },
    {
      "key": "data_source",
      "label": "Where is the data?",
      "type": "select",
      "required": true,
      "options": [
        { "value": "inline",   "label": "I will type / paste it in the next step" },
        { "value": "file",     "label": "It is in an existing file (CSV, JSON, TXT, Excel…)" },
        { "value": "generate", "label": "Generate realistic sample / placeholder data" }
      ]
    },
    {
      "key": "data_source_path",
      "label": "File path (if using an existing file)",
      "type": "string",
      "required": false,
      "placeholder": "/Users/me/data.csv  or  ~/Downloads/sales.xlsx"
    },
    {
      "key": "extra_notes",
      "label": "Extra instructions (optional)",
      "type": "text",
      "required": false,
      "placeholder": "e.g. focus on EMEA region, include a comparison table, 6 slides max…"
    }
  ]
}
-->
