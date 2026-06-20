# PowerPoint — Slide Content Entry

Collect slide content when the user chose "I will type it in". Colours and layout come from the selected template.

## Fields

| Field | Description |
|-------|-------------|
| `presentation_title` | Title shown on slide 1 |
| `presenter` | Presenter name / organisation |
| `slides_outline` | One slide per line: `Title: bullet1 \| bullet2 \| bullet3` |

<!-- FORM_SCHEMA
{
  "title": "Enter your presentation content",
  "message": "Provide a title and outline your slides. Separate bullets with a pipe character (|). Theme comes from your chosen template.",
  "fields": [
    {
      "key": "presentation_title",
      "label": "Presentation title",
      "type": "string",
      "required": true,
      "placeholder": "Q2 Business Review"
    },
    {
      "key": "presenter",
      "label": "Presenter / organisation",
      "type": "string",
      "required": false,
      "placeholder": "Jane Smith · Acme Corp"
    },
    {
      "key": "slides_outline",
      "label": "Slide outline (one slide per line: Title: bullet1 | bullet2 | bullet3)",
      "type": "text",
      "required": true,
      "placeholder": "Introduction: Why this matters | Our current situation | Today's agenda\nKey Findings: Revenue up 12% | Customer NPS improved | Headcount stable\nNext Steps: Launch phase 2 | Hire 3 engineers | Review Q3 budget"
    }
  ]
}
-->
