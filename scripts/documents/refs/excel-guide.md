# Excel Generation Guide (openpyxl)

## Full working template

```python
import subprocess, sys, os
subprocess.check_call([sys.executable,'-m','pip','install','--quiet','--user','openpyxl'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, numbers
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, LineChart, PieChart, Reference

RESULTS_DIR = os.path.join(os.getcwd(), 'output', 'results')
os.makedirs(RESULTS_DIR, exist_ok=True)
OUTPUT_PATH = os.path.join(RESULTS_DIR, 'report.xlsx')

wb = Workbook()
ws = wb.active
ws.title = 'Sheet1'

# --- Write headers ---
headers = ['Month', 'Revenue', 'Expenses', 'Profit']
for col, h in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col, value=h)
    cell.font = Font(bold=True, color='FFFFFF')
    cell.fill = PatternFill('solid', fgColor='2E75B6')
    cell.alignment = Alignment(horizontal='center')

# --- Write data rows ---
data = [
    ('Jan', 45200, 31000, 14200),
    ('Feb', 51800, 33500, 18300),
    ('Mar', 63400, 38200, 25200),
]
for row_idx, row in enumerate(data, 2):
    for col_idx, value in enumerate(row, 1):
        cell = ws.cell(row=row_idx, column=col_idx, value=value)
        if col_idx > 1:  # numeric columns
            cell.number_format = '#,##0'

# --- Auto-fit column widths ---
for col in ws.columns:
    max_len = max((len(str(c.value or '')) for c in col), default=0)
    ws.column_dimensions[get_column_letter(col[0].column)].width = max_len + 4

# --- Add a bar chart ---
chart = BarChart()
chart.type = 'col'
chart.title = 'Q1 Revenue'
chart.y_axis.title = 'Amount ($)'
chart.x_axis.title = 'Month'

data_ref = Reference(ws, min_col=2, min_row=1, max_col=2, max_row=len(data)+1)
cats_ref = Reference(ws, min_col=1, min_row=2, max_row=len(data)+1)
chart.add_data(data_ref, titles_from_data=True)
chart.set_categories(cats_ref)
chart.shape = 4
ws.add_chart(chart, 'F2')

wb.save(OUTPUT_PATH)
print(OUTPUT_PATH)
```

---

## Common patterns

### Multiple sheets
```python
wb = Workbook()
ws1 = wb.active; ws1.title = 'Summary'
ws2 = wb.create_sheet('Details')
ws3 = wb.create_sheet('Charts')
```

### Open and update existing file
```python
from openpyxl import load_workbook
wb = load_workbook('/absolute/path/to/file.xlsx')
ws = wb.active  # or wb['Sheet Name']
ws.append(['NewVal1', 'NewVal2'])  # add row at end
wb.save(OUTPUT_PATH)
```

### Freeze panes (keep headers visible)
```python
ws.freeze_panes = 'A2'  # freeze row 1
```

### Number formats
```python
cell.number_format = '#,##0'          # integer with commas
cell.number_format = '#,##0.00'       # 2 decimal places
cell.number_format = '$#,##0.00'      # currency
cell.number_format = '0.00%'          # percentage
cell.number_format = 'YYYY-MM-DD'     # date
```

### Borders
```python
thin = Side(style='thin')
cell.border = Border(left=thin, right=thin, top=thin, bottom=thin)
```

### Conditional row colouring (alternate rows)
```python
fills = [PatternFill('solid', fgColor='EBF3FB'), PatternFill('solid', fgColor='FFFFFF')]
for i, row in enumerate(ws.iter_rows(min_row=2), 0):
    for cell in row:
        cell.fill = fills[i % 2]
```

### Formulas
```python
ws['D2'] = '=B2-C2'          # simple formula
ws['B6'] = '=SUM(B2:B5)'     # sum
ws['C6'] = '=AVERAGE(C2:C5)' # average
```

### Line chart
```python
from openpyxl.chart import LineChart, Reference
chart = LineChart()
chart.title = 'Trend'
chart.style = 10
data_ref = Reference(ws, min_col=2, min_row=1, max_row=5)
chart.add_data(data_ref, titles_from_data=True)
ws.add_chart(chart, 'E2')
```

### Pie chart
```python
from openpyxl.chart import PieChart, Reference
chart = PieChart()
chart.title = 'Share'
data_ref = Reference(ws, min_col=2, min_row=1, max_row=5)
chart.add_data(data_ref, titles_from_data=True)
ws.add_chart(chart, 'E2')
```

### Set print area and page setup
```python
ws.print_area = 'A1:D20'
ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
ws.page_setup.fitToPage = True
```
