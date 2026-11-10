import React from 'react';
import { File, FileText, FileSpreadsheet, FileArchive, FileCode, Image } from 'lucide-react';
import { tokens } from '../../design-system/tokens';

// Pick a distinct icon + colour per attachment type so PDFs, spreadsheets, docs,
// archives and code/text don't all collapse into one blank white file glyph.
export function getFileVisual(filename?: string, fileType?: string): { Icon: typeof File; color: string } {
  if (fileType?.startsWith('image/')) {
    return { Icon: Image, color: tokens.colors.primary[500] };
  }
  const ext = (filename?.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'pdf':
      return { Icon: FileText, color: tokens.colors.error[500] };
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { Icon: FileSpreadsheet, color: tokens.colors.success[600] };
    case 'doc':
    case 'docx':
    case 'rtf':
      return { Icon: FileText, color: tokens.colors.info[600] };
    case 'ppt':
    case 'pptx':
      return { Icon: FileText, color: tokens.colors.warning[600] };
    case 'zip':
      return { Icon: FileArchive, color: tokens.colors.warning[700] };
    case 'json':
    case 'md':
    case 'markdown':
    case 'txt':
    case 'log':
      return { Icon: FileCode, color: tokens.colors.neutral[600] };
    default:
      return { Icon: File, color: tokens.colors.neutral[500] };
  }
}

// ===== Merge-request URL helpers =====
// The merge-request field used to accept literally anything ("text", "12321"), and a
// saved value never actually linked anywhere. These keep it a real, clickable link
// with a light-touch check — enough to reject non-URLs without demanding an exact
// GitHub/GitLab shape.

/** Prepend https:// when the user typed a bare host (e.g. "gitlab.com/x/y"). */
export function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * A deliberately lenient URL check: it must parse as http(s) and have a dotted host,
 * so "text" / "12321" fail but "github.com/a/b" (after normalize) passes.
 */
export function isValidHttpUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  try {
    const url = new URL(normalizeUrl(value));
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

// Read-mode value styling for the Details rail — plain text that reads as information,
// not a form control, until the user hits "Edit". The 8px inset keeps it aligned with
// the edit-mode inputs (which carry their own padding) so nothing shifts on toggle.
export const readValueStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  fontSize: 13,
  color: tokens.colors.neutral[900],
};
export const readEmptyStyle: React.CSSProperties = {
  ...readValueStyle,
  color: tokens.colors.neutral[500],
};
