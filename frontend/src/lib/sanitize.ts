import DOMPurify from 'dompurify';

/**
 * Clean rich-text HTML before it is injected into the DOM.
 *
 * Ticket descriptions (and the rich-text editor's own content) are stored as HTML, so
 * they must be sanitized on the way into the page — stripping anything executable such
 * as <script>, inline event handlers like onerror, and javascript: URLs — while keeping
 * normal formatting (bold, lists, links, …). This neutralizes both new input and any
 * payload already stored in the database.
 *
 * DOMPurify needs a browser DOM. These views are client-only, but during server-side
 * rendering there is no `window`, so we return an empty string and let the client render
 * the sanitized HTML after hydration (the content only appears on client interaction).
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}
