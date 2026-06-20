# PowerPoint Generation Guide (python-pptx)

## Full working template

```python
import subprocess, sys, os
subprocess.check_call([sys.executable,'-m','pip','install','--quiet','--user','python-pptx'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

RESULTS_DIR = os.path.join(os.getcwd(), 'output', 'results')
os.makedirs(RESULTS_DIR, exist_ok=True)
OUTPUT_PATH = os.path.join(RESULTS_DIR, 'presentation.pptx')

prs = Presentation()
# Slide dimensions: 13.33" × 7.5" (widescreen 16:9)
SLIDE_W = prs.slide_width   # Emu
SLIDE_H = prs.slide_height  # Emu

BLANK = prs.slide_layouts[6]   # fully blank — use this for full control
TITLE_ONLY = prs.slide_layouts[5]

# Colours
BG_DARK   = RGBColor(0x1F, 0x39, 0x7B)   # dark navy
ACCENT    = RGBColor(0x2E, 0x75, 0xB6)   # blue
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT_TXT = RGBColor(0xBD, 0xC3, 0xC7)

def add_textbox(slide, text, left, top, width, height,
                font_size=24, bold=False, color=WHITE,
                align=PP_ALIGN.LEFT, word_wrap=True):
    txb = slide.shapes.add_textbox(left, top, width, height)
    tf  = txb.text_frame
    tf.word_wrap = word_wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = color
    return txb

def set_slide_bg(slide, color: RGBColor):
    from pptx.oxml.ns import qn
    from lxml import etree
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color

# ── Slide 1: Title ──────────────────────────────────────────────────────────
slide1 = prs.slides.add_slide(BLANK)
set_slide_bg(slide1, BG_DARK)

add_textbox(slide1, 'Your Presentation Title',
            Inches(1), Inches(2.5), Inches(11.33), Inches(1.5),
            font_size=44, bold=True, align=PP_ALIGN.CENTER)

add_textbox(slide1, 'Subtitle · Author · Date',
            Inches(1), Inches(4.2), Inches(11.33), Inches(0.8),
            font_size=20, color=LIGHT_TXT, align=PP_ALIGN.CENTER)

# ── Slide 2: Content with bullets ───────────────────────────────────────────
slide2 = prs.slides.add_slide(BLANK)
set_slide_bg(slide2, RGBColor(0xF5, 0xF6, 0xFA))

# Accent bar on the left
bar = slide2.shapes.add_shape(1, Inches(0), Inches(0), Inches(0.15), SLIDE_H)
bar.fill.solid(); bar.fill.fore_color.rgb = ACCENT
bar.line.fill.background()

add_textbox(slide2, 'Section Heading',
            Inches(0.4), Inches(0.3), Inches(12.5), Inches(0.9),
            font_size=32, bold=True, color=RGBColor(0x1F,0x39,0x7B))

bullets = ['First key point goes here',
           'Second key point with supporting detail',
           'Third key point — keep each bullet to one line']

from pptx.util import Pt
txb = slide2.shapes.add_textbox(Inches(0.4), Inches(1.4), Inches(12), Inches(5))
tf = txb.text_frame; tf.word_wrap = True
for i, bullet in enumerate(bullets):
    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
    p.text = f'• {bullet}'
    p.alignment = PP_ALIGN.LEFT
    p.runs[0].font.size = Pt(22)
    p.runs[0].font.color.rgb = RGBColor(0x2C, 0x3E, 0x50)
    p.space_after = Pt(12)

# Speaker notes
notes_slide = slide2.notes_slide
notes_slide.notes_text_frame.text = 'Speaker notes go here.'

prs.save(OUTPUT_PATH)
print(OUTPUT_PATH)
```

---

## Common patterns

### Add image to slide
```python
slide.shapes.add_picture('/path/to/image.png', Inches(1), Inches(1), Inches(6), Inches(4))
```

### Add table
```python
from pptx.util import Inches, Pt
rows, cols = 4, 3
table = slide.shapes.add_table(rows, cols, Inches(1), Inches(2), Inches(10), Inches(3)).table

# Header row
for col_idx, header in enumerate(['Name', 'Value', 'Change']):
    cell = table.cell(0, col_idx)
    cell.text = header
    cell.text_frame.paragraphs[0].runs[0].font.bold = True
    cell.fill.solid(); cell.fill.fore_color.rgb = RGBColor(0x2E,0x75,0xB6)

# Data rows
data = [('Alpha', '42', '+5%'), ('Beta', '91', '-2%'), ('Gamma', '57', '+12%')]
for r, (a, b, c) in enumerate(data, 1):
    for c_idx, val in enumerate([a, b, c]):
        table.cell(r, c_idx).text = val
```

### Two-column layout (text + image)
```python
# Left text block
add_textbox(slide, 'Key insight here...', Inches(0.4), Inches(1.4), Inches(5.5), Inches(5))
# Right image
slide.shapes.add_picture('/path/image.png', Inches(6.5), Inches(1.4), Inches(6), Inches(5))
```

### Open and modify existing presentation
```python
from pptx import Presentation
prs = Presentation('/absolute/path/to/file.pptx')
# Access existing slides
slide = prs.slides[0]
# Add a new slide
new_slide = prs.slides.add_slide(prs.slide_layouts[6])
prs.save(OUTPUT_PATH)
```

### Progress bar shape
```python
# Background bar
bg = slide.shapes.add_shape(1, Inches(1), Inches(6.5), Inches(11), Inches(0.3))
bg.fill.solid(); bg.fill.fore_color.rgb = RGBColor(0xE0,0xE0,0xE0)
bg.line.fill.background()
# Fill (e.g. 70%)
fill = slide.shapes.add_shape(1, Inches(1), Inches(6.5), Inches(11*0.7), Inches(0.3))
fill.fill.solid(); fill.fill.fore_color.rgb = ACCENT
fill.line.fill.background()
```

### Slide dimensions reference
```python
# Widescreen 16:9
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
# All position/size values use Emu (English Metric Units)
# Inches(1) = 914400 Emu
```
