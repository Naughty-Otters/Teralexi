import { readSkillAttachment as readSkillAttachmentImpl } from '@main/skills/skill-attachments'
import { exportMarkdownBodyToPdf as exportMarkdownBodyToPdfImpl } from '@main/agent/sandbox/markdown-to-pdf'
import { exportHtmlFileToPdf as exportHtmlFileToPdfImpl } from '@main/agent/sandbox/html-to-pdf'
import {
  getOutputResultsRelPrefix,
  getOutputScriptsRelPrefix,
  requireActiveSandbox,
  resolveSandboxRelativePath,
  resolveScopedSandboxPath,
  resolvePathAllowingOutside,
} from '@main/agent/sandbox'
import {
  getValidAccessToken,
  loadStoredAccount,
} from '@main/services/google-workspace-oauth'

export type {
  MarkdownPdfDocumentKind,
  SandboxRequireResult,
  SkillAttachmentContent,
} from './types'

export {
  getOutputResultsRelPrefix,
  getOutputScriptsRelPrefix,
  requireActiveSandbox,
  resolveSandboxRelativePath,
  resolveScopedSandboxPath,
  resolvePathAllowingOutside,
}

export function readSkillAttachment(
  skillId: string,
  relativePath: string,
) {
  return readSkillAttachmentImpl(skillId, relativePath)
}

export function exportMarkdownBodyToPdf(
  markdownBody: string,
  pdfPath: string,
  kind: import('./types').MarkdownPdfDocumentKind = 'default',
): Promise<void> {
  return exportMarkdownBodyToPdfImpl(markdownBody, pdfPath, kind)
}

export function exportHtmlFileToPdf(
  htmlPath: string,
  pdfPath: string,
): Promise<void> {
  return exportHtmlFileToPdfImpl(htmlPath, pdfPath)
}

export { getValidAccessToken, loadStoredAccount }
