import { readSkillAttachment } from '@teralexi/skill-sdk'
import { DOCUMENTS_SKILL_ID, type ExcelThemeStyle, type PptThemeColors } from './types'

const PPT_THEMES_PATH = 'templates/styles/ppt-themes.json'
const EXCEL_THEMES_PATH = 'templates/styles/excel-themes.json'

export type PptThemeEntry = PptThemeColors & {
  titleSlide?: { titleSize?: number; subtitleSize?: number; accentBarHeight?: number }
  contentSlide?: { titleSize?: number; bulletSize?: number; stripeWidth?: number }
}

function loadJsonAttachment<T>(relativePath: string): T {
  const { content } = readSkillAttachment(DOCUMENTS_SKILL_ID, relativePath)
  return JSON.parse(content) as T
}

export function loadPptThemes(): Record<string, PptThemeEntry> {
  return loadJsonAttachment<Record<string, PptThemeEntry>>(PPT_THEMES_PATH)
}

export function loadExcelThemes(): Record<string, ExcelThemeStyle> {
  return loadJsonAttachment<Record<string, ExcelThemeStyle>>(EXCEL_THEMES_PATH)
}

export function resolvePptTheme(themeKey: string): PptThemeEntry {
  const themes = loadPptThemes()
  return themes[themeKey] ?? themes.navy
}

export function resolveExcelTheme(themeKey: string): ExcelThemeStyle {
  const themes = loadExcelThemes()
  return themes[themeKey] ?? themes['corporate-blue']
}
