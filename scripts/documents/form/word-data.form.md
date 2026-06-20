# Word Document — Content Entry

Collect the document structure when the user chose "I will type it in".

## Fields

| Field | Description |
|-------|-------------|
| `author` | Author name shown in the document |
| `sections` | Section headings and content, one section per line |
| `include_table` | Whether to include a data table |
| `table_data` | Table headers and rows (if requested) |
| `doc_style` | Formal or informal tone |

<!-- FORM_SCHEMA
{
  "title": "Enter your document content",
  "message": "Provide the sections for your document. Each line is one section: Heading: paragraph text.",
  "fields": [
    {
      "key": "author",
      "label": "Author",
      "type": "string",
      "required": false,
      "placeholder": "Jane Smith"
    },
    {
      "key": "sections",
      "label": "Document sections (one per line: Heading: content)",
      "type": "text",
      "required": true,
      "placeholder": "Introduction: This document outlines our Q1 achievements and sets priorities for Q2.\nKey Results: Revenue exceeded target by 8%. Customer satisfaction reached an all-time high.\nNext Steps: Expand the sales team. Launch the new product line in April."
    },
    {
      "key": "include_table",
      "label": "Include a data table?",
      "type": "boolean",
      "required": false
    },
    {
      "key": "table_data",
      "label": "Table data (headers on first line, then rows — comma-separated)",
      "type": "text",
      "required": false,
      "placeholder": "Item, Value, Status\nRevenue, $1.2M, On track\nHeadcount, 48, +3 planned"
    },
    {
      "key": "doc_style",
      "label": "Document style",
      "type": "select",
      "required": false,
      "options": [
        { "value": "formal",   "label": "Formal (report, brief, memo)" },
        { "value": "informal", "label": "Informal (internal update, notes)" }
      ]
    }
  ]
}
-->
