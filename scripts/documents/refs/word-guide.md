# Word Document Generation Guide (python-docx)

## Full working template

```python
import subprocess, sys, os
subprocess.check_call([sys.executable,'-m','pip','install','--quiet','--user','python-docx'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

from docx import Document
from docx.shared import Pt, Inches, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

RESULTS_DIR = os.path.join(os.getcwd(), 'output', 'results')
os.makedirs(RESULTS_DIR, exist_ok=True)
OUTPUT_PATH = os.path.join(RESULTS_DIR, 'document.docx')

doc = Document()

# ── Page margins ──────────────────────────────────────────────────────────────
for section in doc.sections:
    section.top_margin    = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin   = Cm(3.0)
    section.right_margin  = Cm(3.0)

# ── Title ─────────────────────────────────────────────────────────────────────
title = doc.add_heading('Document Title', level=0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER

# ── Subtitle / author / date ──────────────────────────────────────────────────
subtitle = doc.add_paragraph('Author Name · 2025-06-01')
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
subtitle.runs[0].font.color.rgb = RGBColor(0x70, 0x70, 0x70)
subtitle.runs[0].font.size = Pt(11)

doc.add_paragraph()  # blank line

# ── Section 1 ─────────────────────────────────────────────────────────────────
doc.add_heading('1. Introduction', level=1)
p = doc.add_paragraph(
    'This document demonstrates python-docx capabilities. '
    'It covers headings, paragraphs, tables, and lists.'
)
p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

# ── Sub-section ───────────────────────────────────────────────────────────────
doc.add_heading('1.1 Background', level=2)
doc.add_paragraph('Background content goes here.')

# ── Bullet list ───────────────────────────────────────────────────────────────
doc.add_heading('2. Key Points', level=1)
for item in ['First key point', 'Second key point', 'Third key point']:
    doc.add_paragraph(item, style='List Bullet')

# ── Numbered list ─────────────────────────────────────────────────────────────
doc.add_heading('3. Steps', level=1)
for step in ['Open the application', 'Configure settings', 'Click Save']:
    doc.add_paragraph(step, style='List Number')

# ── Table ─────────────────────────────────────────────────────────────────────
doc.add_heading('4. Data Table', level=1)
table = doc.add_table(rows=1, cols=3)
table.style = 'Table Grid'
table.alignment = WD_TABLE_ALIGNMENT.CENTER

# Header row
hdr = table.rows[0].cells
for i, h in enumerate(['Category', 'Value', 'Notes']):
    hdr[i].text = h
    hdr[i].paragraphs[0].runs[0].bold = True
    # Shade header
    tc = hdr[i]._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), '2E75B6')
    tcPr.append(shd)

# Data rows
rows_data = [('Alpha', '42', 'Stable'), ('Beta', '91', 'Growing'), ('Gamma', '57', 'Review')]
for cat, val, note in rows_data:
    row = table.add_row().cells
    row[0].text = cat; row[1].text = val; row[2].text = note

doc.add_paragraph()  # spacing after table

# ── Page break before next section ───────────────────────────────────────────
doc.add_page_break()
doc.add_heading('5. Conclusion', level=1)
doc.add_paragraph('Summary and conclusion here.')

doc.save(OUTPUT_PATH)
print(OUTPUT_PATH)
```

---

## Common patterns

### Open and update existing document
```python
from docx import Document
doc = Document('/absolute/path/to/file.docx')
# Append new content
doc.add_heading('New Section', level=1)
doc.add_paragraph('New content added.')
doc.save(OUTPUT_PATH)
```

### Bold / italic / colour inline in a paragraph
```python
p = doc.add_paragraph()
p.add_run('Normal text. ')
run = p.add_run('Bold and coloured.')
run.bold = True
run.font.color.rgb = RGBColor(0x2E, 0x75, 0xB6)
run.font.size = Pt(12)
```

### Paragraph spacing
```python
from docx.shared import Pt
p = doc.add_paragraph('Some text')
p.paragraph_format.space_before = Pt(6)
p.paragraph_format.space_after  = Pt(6)
p.paragraph_format.line_spacing = Pt(18)  # 18pt line spacing
```

### Add image
```python
doc.add_picture('/path/to/image.png', width=Inches(5))
last_paragraph = doc.paragraphs[-1]
last_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
```

### Two-column table for side-by-side layout
```python
table = doc.add_table(rows=1, cols=2)
table.style = 'Table Grid'
left_cell  = table.cell(0, 0)
right_cell = table.cell(0, 1)
left_cell.text  = 'Left column content'
right_cell.text = 'Right column content'
```

### Set column widths
```python
from docx.shared import Inches
table.columns[0].width = Inches(2)
table.columns[1].width = Inches(3)
table.columns[2].width = Inches(1.5)
```

### Footer with page numbers
```python
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

section = doc.sections[0]
footer  = section.footer
p = footer.paragraphs[0]
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run()
fldChar1 = OxmlElement('w:fldChar'); fldChar1.set(qn('w:fldCharType'), 'begin')
instrText = OxmlElement('w:instrText'); instrText.text = 'PAGE'
fldChar2 = OxmlElement('w:fldChar'); fldChar2.set(qn('w:fldCharType'), 'end')
for el in [fldChar1, instrText, fldChar2]:
    run._r.append(el)
```

### Available built-in paragraph styles
```
'Normal', 'Heading 1' … 'Heading 9',
'Title', 'Subtitle',
'List Bullet', 'List Bullet 2', 'List Bullet 3',
'List Number', 'List Number 2', 'List Number 3',
'Quote', 'Body Text', 'Caption'
```

### Available built-in table styles
```
'Table Grid', 'Light Shading', 'Light List', 'Light Grid',
'Medium Shading 1', 'Medium Shading 2', 'Medium List 1', 'Medium List 2',
'Medium Grid 1', 'Medium Grid 2', 'Medium Grid 3',
'Dark List', 'Colorful Shading', 'Colorful List', 'Colorful Grid'
```
