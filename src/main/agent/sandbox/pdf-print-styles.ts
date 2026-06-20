/**
 * Shared print/PDF typography — uses local system fonts only (no network fetch).
 * Avoids Georgia/Inter/Cascadia stacks that are missing on many Linux installs.
 */

export const PDF_SERIF_FONT_STACK = [
  'PdfSerif',
  'Noto Serif',
  'Times New Roman',
  'Times',
  'Liberation Serif',
  'Songti SC',
  'SimSun',
  'serif',
].join(', ')

export const PDF_SANS_FONT_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  'Noto Sans',
  'sans-serif',
].join(', ')

export const PDF_MONO_FONT_STACK = [
  'Menlo',
  'Monaco',
  'Consolas',
  'Courier New',
  'monospace',
].join(', ')

/** @font-face rules that map PdfSerif/PdfSans to common OS fonts via `local()`. */
export function pdfDocumentFontFaceCss(): string {
  return `
      @font-face {
        font-family: 'PdfSerif';
        font-style: normal;
        font-weight: 400;
        src: local('Times New Roman'), local('Times'), local('Noto Serif'),
             local('Liberation Serif'), local('Songti SC'), local('SimSun');
      }
      @font-face {
        font-family: 'PdfSerif';
        font-style: normal;
        font-weight: 700;
        src: local('Times New Roman Bold'), local('Times Bold'), local('Noto Serif Bold'),
             local('Liberation Serif Bold');
      }
      @font-face {
        font-family: 'PdfSans';
        font-style: normal;
        font-weight: 400;
        src: local('-apple-system'), local('Segoe UI'), local('Roboto'),
             local('Helvetica Neue'), local('Arial'), local('Noto Sans');
      }
    `
}
