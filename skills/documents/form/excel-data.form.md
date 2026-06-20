# Excel — Inline Data Entry

Collect spreadsheet data when the user chose "I will type it in". Chart and colours come from the selected template — not this form.

## Fields

| Field | Description |
|-------|-------------|
| `columns` | Column headers, comma-separated |
| `rows` | Each data row on its own line; values separated by commas |

<!-- FORM_SCHEMA
{
  "title": "Enter your spreadsheet data",
  "message": "Type the column headers and rows below. Use commas to separate values. Formatting is applied from your chosen template.",
  "fields": [
    {
      "key": "columns",
      "label": "Column headers (comma-separated)",
      "type": "string",
      "required": true,
      "placeholder": "Month, Revenue, Expenses, Profit"
    },
    {
      "key": "rows",
      "label": "Data rows (one row per line, values comma-separated)",
      "type": "text",
      "required": true,
      "placeholder": "January, 45200, 31000, 14200\nFebruary, 51800, 33500, 18300\nMarch, 63400, 38200, 25200"
    }
  ]
}
-->
