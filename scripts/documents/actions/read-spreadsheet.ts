/**
 * read_spreadsheet — read an existing .xlsx file and return its data as JSON.
 * Used before update operations so the agent knows the current state.
 */

import ExcelJS from 'exceljs'
import path from 'path'
import type { SkillTool } from '../../../src/main/skills/types'
import {
  requireActiveSandbox,
  resolvePathAllowingOutside,
} from '../../../toolSet/sandbox-paths'

export const readSpreadsheet: SkillTool = {
  name: 'read_spreadsheet',
  description:
    'Read an existing Excel (.xlsx) file and return its contents as structured JSON ' +
    '(columns array + rows array). Use this before update operations to see the current data.',
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }

    const rawPath = String(input['file_path'] ?? '')
    if (!rawPath) return { error: 'file_path is required' }

    const filePath = resolvePathAllowingOutside(sandbox.root, rawPath)
    const sheetName = input['sheet_name'] ? String(input['sheet_name']) : undefined
    const maxRows   = Number(input['max_rows'] ?? 200)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(filePath)

    const ws = sheetName
      ? wb.getWorksheet(sheetName)
      : wb.worksheets[0]

    if (!ws) {
      return {
        error: sheetName
          ? `Sheet "${sheetName}" not found. Available: ${wb.worksheets.map((s) => s.name).join(', ')}`
          : 'No worksheets found',
      }
    }

    // Extract header row
    const headerRow = ws.getRow(1)
    const columns: string[] = []
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      columns.push(String(cell.value ?? ''))
    })

    // Extract data rows
    const rows: (string | number | null)[][] = []
    let rowIdx = 0
    ws.eachRow({ includeEmpty: false }, (row, lineNumber) => {
      if (lineNumber === 1) return  // skip header
      if (rowIdx >= maxRows) return
      const values: (string | number | null)[] = []
      columns.forEach((_, colIdx) => {
        const cell = row.getCell(colIdx + 1)
        const v = cell.value
        if (v === null || v === undefined) {
          values.push(null)
        } else if (typeof v === 'object' && v !== null && 'result' in v) {
          // formula cell
          values.push((v as { result?: unknown }).result as string | number ?? null)
        } else {
          values.push(v as string | number)
        }
      })
      rows.push(values)
      rowIdx++
    })

    return {
      success: true,
      file_path: filePath,
      sheet_name: ws.name,
      available_sheets: wb.worksheets.map((s) => s.name),
      columns,
      rows,
      row_count: rows.length,
      message: `Read ${rows.length} rows × ${columns.length} columns from "${ws.name}"`,
    }
  },
}
