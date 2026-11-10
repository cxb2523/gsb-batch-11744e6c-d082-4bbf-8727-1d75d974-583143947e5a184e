'use client';

import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, ExternalLink, FileText, X } from 'lucide-react';

import type { StageAttachment } from '@/lib/api/lifecycle';
import { C, LAYER, RADIUS, space } from './tokens';

interface Props {
  attachment: StageAttachment | null;
  downloadUrl: (attachmentId: number) => string;
  onClose: () => void;
}

type Kind = 'image' | 'pdf' | 'markdown' | 'text' | 'other';

/** What this panel can show itself, and how. */
function viewerKind(attachment: StageAttachment): Kind {
  const type = (attachment.content_type ?? '').toLowerCase();
  const name = attachment.label.toLowerCase();
  // An SVG is never uploaded and never rendered here: it can carry script.
  if (type.startsWith('image/') && type !== 'image/svg+xml') return 'image';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type === 'text/markdown' || name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  if (type.startsWith('text/')) return 'text';
  return 'other';
}

/**
 * Whether a file belongs in the browser's own tab rather than in this panel.
 * Only what this panel genuinely cannot render: Word, Excel, PowerPoint, and
 * links, which were never ours to show.
 */
export function opensOutside(attachment: StageAttachment): boolean {
  return attachment.kind === 'link' || viewerKind(attachment) === 'other';
}

const TEXT_LIMIT = 500_000;

/**
 * Reads a document without leaving the page: images, PDFs, Markdown, plain text
 * and CSV. Anything a browser cannot show honestly (Word, Excel, PowerPoint) is
 * offered as a download rather than rendered badly.
 */
export function DocumentViewer({ attachment, downloadUrl, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  // The app's content policy allows embedding only from this page's own origin,
  // and the API serves files from another one. A blob URL counts as our origin,
  // so the PDF is fetched first and shown from that rather than from the API URL.
  const [blob, setBlob] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const kind = attachment ? viewerKind(attachment) : 'other';
  const source = attachment ? downloadUrl(attachment.id) : '';

  useEffect(() => {
    if (!attachment) return;
    setText(null);
    setBlob(null);
    setFailed(false);
    if (kind !== 'markdown' && kind !== 'text' && kind !== 'pdf') return;

    const controller = new AbortController();
    let objectUrl: string | null = null;

    fetch(source, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async (response): Promise<Blob | string> => {
        if (!response.ok) throw new Error(String(response.status));
        return kind === 'pdf' ? response.blob() : response.text();
      })
      .then((body) => {
        if (typeof body === 'string') {
          setText(body.slice(0, TEXT_LIMIT));
          return;
        }
        objectUrl = URL.createObjectURL(body);
        setBlob(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);   // the file is not left in memory
    };
  }, [attachment, kind, source]);

  useEffect(() => {
    if (!attachment) return;
    requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])');
      const [first, last] = [focusable[0], focusable[focusable.length - 1]];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [attachment, onClose]);

  if (!attachment) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: LAYER.popover + 10,
        background: 'rgba(9, 30, 66, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: space(3),
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={attachment.label}
        style={{
          width: 'min(1040px, 100%)',
          height: 'min(88vh, 100%)',
          display: 'flex',
          flexDirection: 'column',
          background: C.surface,
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: space(1), padding: `${space(1.5)}px ${space(2)}px`, borderBottom: `1px solid ${C.divider}` }}>
          <FileText size={16} aria-hidden style={{ color: C.textSubtle, flexShrink: 0 }} />
          <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {attachment.label}
          </h2>
          <a className="lc-btn lc-btn--sm" href={source} target="_blank" rel="noopener noreferrer" title="Open in a new tab">
            <ExternalLink size={14} aria-hidden /> New Tab
          </a>
          <a className="lc-btn lc-btn--sm" href={source} download={attachment.label}>
            <Download size={14} aria-hidden /> Download
          </a>
          <button ref={closeRef} type="button" className="lc-icon-btn" aria-label="Close the viewer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: kind === 'image' ? '#1D2125' : C.surface }}>
          {kind === 'pdf' && (
            failed ? (
              <Fallback label={attachment.label} source={source} reason="This file could not be loaded." />
            ) : blob === null ? (
              <div style={{ padding: space(3) }}>
                <div className="lc-skeleton" style={{ height: 420, borderRadius: RADIUS.lg }} />
              </div>
            ) : (
              <object data={blob} type="application/pdf" style={{ width: '100%', height: '100%' }} aria-label={attachment.label}>
                <Fallback label={attachment.label} source={source} reason="This browser has no built-in PDF viewer." />
              </object>
            )
          )}

          {kind === 'image' && (
            <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space(2) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source} alt={attachment.label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          )}

          {(kind === 'markdown' || kind === 'text') && (
            <div style={{ padding: space(3), maxWidth: 760, margin: '0 auto' }}>
              {failed ? (
                <Fallback label={attachment.label} source={source} reason="This file could not be read." />
              ) : text === null ? (
                <div className="lc-skeleton" style={{ height: 240, borderRadius: RADIUS.lg }} />
              ) : kind === 'markdown' ? (
                <div className="lc-prose">
                  {/* GFM for tables and task lists. react-markdown escapes raw HTML by
                      default, so an uploaded file cannot inject any. */}
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                </div>
              ) : (
                <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textBody, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {text}
                </pre>
              )}
            </div>
          )}

          {kind === 'other' && (
            <Fallback
              label={attachment.label}
              source={source}
              reason="Word, Excel and PowerPoint files cannot be shown in a browser. Download it to read it."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Fallback({ label, source, reason }: { label: string; source: string; reason: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: space(1), padding: space(4), textAlign: 'center' }}>
      <span aria-hidden style={{ color: C.textDisabled }}><FileText size={28} /></span>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, color: C.textMuted, maxWidth: 360, lineHeight: 1.5 }}>{reason}</p>
      <a className="lc-btn lc-btn--primary" href={source} download={label} target="_blank" rel="noopener noreferrer" style={{ marginTop: space(1) }}>
        <ExternalLink size={15} aria-hidden /> Download
      </a>
    </div>
  );
}
