import { readSkillAttachment } from '@teralexi/skill-sdk'
import { WEBSITE_SKILL_ID, type ThemeMap, type ThemeTokens } from './types'

const THEMES_PATH = 'templates/styles/themes.json'

const DEFAULT_THEME: ThemeTokens = {
  bg: '#fafafa',
  surface: '#ffffff',
  text: '#1a1a1a',
  textMuted: '#5c5c5c',
  accent: '#2563eb',
  accentHover: '#1d4ed8',
  border: '#e5e7eb',
  fontSans: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
}

export function loadThemes(): ThemeMap {
  const { content } = readSkillAttachment(WEBSITE_SKILL_ID, THEMES_PATH)
  return JSON.parse(content) as ThemeMap
}

export function resolveTheme(themeKey: string | undefined, fallback: string): ThemeTokens {
  const themes = loadThemes()
  const key = (themeKey ?? fallback).trim()
  return themes[key] ?? themes[fallback] ?? DEFAULT_THEME
}
