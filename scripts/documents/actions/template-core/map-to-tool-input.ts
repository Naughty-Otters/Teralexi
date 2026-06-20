import { resolveExcelTheme, resolvePptTheme } from './load-themes'
import type { DocumentData, TemplateManifestEntry } from './types'

export function mapToSpreadsheetInput(
  template: TemplateManifestEntry,
  data: DocumentData,
  outputFilename: string,
): Record<string, unknown> {
  const style = (template.style ?? {}) as Record<string, unknown>
  const themeKey = String(style.theme ?? 'corporate-blue')
  const theme = resolveExcelTheme(themeKey)
  const chart = style.chart as Record<string, unknown> | undefined

  return {
    output_filename: outputFilename,
    sheet_name: data.sheet?.sheet_name ?? style.sheet_name ?? 'Sheet1',
    columns: data.sheet?.columns ?? [],
    rows: data.sheet?.rows ?? [],
    header_color: theme.header.fill,
    excel_theme: theme,
    add_chart: chart?.enabled ?? false,
    chart_type: chart?.type ?? 'bar',
    chart_column:
      chart?.column ??
      (data.sheet?.columns?.[1] ?? data.sheet?.columns?.[0] ?? 'Revenue'),
  }
}

export function mapToPresentationInput(
  template: TemplateManifestEntry,
  data: DocumentData,
  outputFilename: string,
): Record<string, unknown> {
  const style = (template.style ?? {}) as Record<string, unknown>
  const themeKey = String(style.theme ?? 'navy')

  return {
    output_filename: outputFilename,
    presentation_title: data.title,
    presenter: data.meta?.presenter ?? data.meta?.author ?? '',
    theme: themeKey,
    ppt_theme: resolvePptTheme(themeKey),
    slides: data.slides ?? [],
  }
}

export function mapToWordDocInput(
  template: TemplateManifestEntry,
  data: DocumentData,
  outputFilename: string,
): Record<string, unknown> {
  const style = (template.style ?? {}) as Record<string, unknown>

  return {
    output_filename: outputFilename,
    title: data.title,
    author: data.meta?.author ?? '',
    style: style.doc_style ?? 'formal',
    sections: data.sections ?? [],
    table_data: data.table ?? undefined,
  }
}

export function mapToHtmlRenderContext(
  template: TemplateManifestEntry,
  data: DocumentData,
): Record<string, unknown> {
  return {
    title: data.title,
    meta: data.meta ?? {},
    sections: data.sections ?? [],
    table: data.table ?? undefined,
    style: template.style ?? {},
  }
}
