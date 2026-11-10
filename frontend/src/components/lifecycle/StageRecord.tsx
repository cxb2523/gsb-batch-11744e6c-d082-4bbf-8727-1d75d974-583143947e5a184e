'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Download, ExternalLink, FileText, Link2, Paperclip, Send, Trash2, Upload } from 'lucide-react';

import type { StageAttachment, StageDetail, StageRemark } from '@/lib/api/lifecycle';
import { Avatar } from '@/design-system/components';
import { opensOutside } from './DocumentViewer';
import { C, IST_TIME, RADIUS, VISUALLY_HIDDEN, space } from './tokens';

interface Props {
  /** The streams this stage runs, if any. Empty means one shared record. */
  tracks: string[];
  detail: StageDetail | null;
  loading: boolean;
  saving: boolean;
  /** So a remark shows its own remove control and nobody else's. */
  currentUserEmail: string;
  isAdmin: boolean;
  downloadUrl: (attachmentId: number) => string;
  onAddRemark: (body: string, track: string | null) => Promise<boolean>;
  onRemoveRemark: (remark: StageRemark) => void;
  onAddLink: (url: string, label: string, track: string | null) => Promise<boolean>;
  onUpload: (file: File, track: string | null) => Promise<boolean>;
  onOpen: (attachment: StageAttachment) => void;
  onRemoveAttachment: (attachment: StageAttachment) => void;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** "2.4 MB", "812 KB" */
function fileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "figma.com", so a link says where it goes before you follow it. */
function linkHost(url: string | null): string {
  if (!url) return 'link';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

/** The stamp on a document: what it is, at a glance, without opening it. */
const FILE_KIND: Record<string, { label: string; bg: string; fg: string }> = {
  pdf: { label: 'PDF', bg: '#FFECEB', fg: '#AE2E24' },
  doc: { label: 'DOC', bg: '#E9F2FF', fg: '#0055CC' },
  docx: { label: 'DOC', bg: '#E9F2FF', fg: '#0055CC' },
  xls: { label: 'XLS', bg: '#DCFFF1', fg: '#216E4E' },
  xlsx: { label: 'XLS', bg: '#DCFFF1', fg: '#216E4E' },
  csv: { label: 'CSV', bg: '#DCFFF1', fg: '#216E4E' },
  ppt: { label: 'PPT', bg: '#FFF7E6', fg: '#974F0C' },
  pptx: { label: 'PPT', bg: '#FFF7E6', fg: '#974F0C' },
  md: { label: 'MD', bg: '#F3F0FF', fg: '#5E4DB2' },
  markdown: { label: 'MD', bg: '#F3F0FF', fg: '#5E4DB2' },
  txt: { label: 'TXT', bg: '#F1F2F4', fg: '#44546F' },
};

const GENERIC_KIND = { label: 'FILE', bg: '#F1F2F4', fg: '#44546F' };

function fileKind(attachment: StageAttachment) {
  const extension = attachment.label.toLowerCase().split('.').pop() ?? '';
  return FILE_KIND[extension] ?? GENERIC_KIND;
}

function isImage(attachment: StageAttachment): boolean {
  const type = (attachment.content_type ?? '').toLowerCase();
  return attachment.kind === 'file' && type.startsWith('image/') && type !== 'image/svg+xml';
}

const SECTION_TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: C.text,
};

/** The remarks, files and links recorded against one stage. */
export function StageRecord({
  tracks,
  detail,
  loading,
  saving,
  currentUserEmail,
  isAdmin,
  downloadUrl,
  onAddRemark,
  onRemoveRemark,
  onAddLink,
  onUpload,
  onOpen,
  onRemoveAttachment,
}: Props) {
  const remarkId = useId();
  const linkId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Which stream is being read and written. Stages without streams stay on null.
  const [track, setTrack] = useState<string | null>(tracks[0] ?? null);

  // The dock keeps its place when it swaps to a stage that runs different streams.
  useEffect(() => setTrack(tracks[0] ?? null), [tracks.join('|')]);   // eslint-disable-line react-hooks/exhaustive-deps

  const sendRemark = async () => {
    const value = body.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    const kept = body;
    setBody('');
    const ok = await onAddRemark(value, track);
    setSending(false);
    if (!ok) {
      setBody(kept);   // never lose what someone typed
      setError("Couldn't post that remark. Try again.");
    }
  };

  const saveLink = async () => {
    const value = url.trim();
    if (!value) {
      setError('Paste a link first.');
      return;
    }
    if (!/^https?:\/\//i.test(value)) {
      setError('Links need to start with http:// or https://');
      return;
    }
    setError(null);
    const ok = await onAddLink(value, label.trim(), track);
    if (ok) {
      setUrl('');
      setLabel('');
      setLinkOpen(false);
    } else {
      setError("Couldn't save that link. Try again.");
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`${file.name} is ${fileSize(file.size)}. Files need to be 10 MB or smaller.`);
      return;
    }
    setError(null);
    const ok = await onUpload(file, track);
    if (!ok) setError(`Couldn't upload ${file.name}. Try again.`);
  };

  const canRemove = (email: string) => isAdmin || email.toLowerCase() === currentUserEmail.toLowerCase();

  if (loading && !detail) {
    return (
      <div aria-busy="true" aria-label="Loading this stage's record" style={{ display: 'flex', flexDirection: 'column', gap: space(1.5) }}>
        {[0, 1, 2].map((row) => (
          <div key={row} className="lc-skeleton" style={{ height: 44, borderRadius: RADIUS.lg }} />
        ))}
      </div>
    );
  }

  // A stage with streams shows one stream at a time; anything recorded before the
  // streams existed has no stream of its own, so it stays visible under each.
  const onTrack = <T extends { track: string | null }>(rows: T[]) =>
    track === null ? rows : rows.filter((row) => row.track === track || row.track === null);

  const remarks = onTrack(detail?.remarks ?? []);
  const attachments = onTrack(detail?.attachments ?? []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space(3) }}>
      {tracks.length > 0 && (
        <div className="lc-tabs" role="tablist" aria-label="Streams in this stage">
          {tracks.map((name) => {
            const counts = (detail?.remarks.filter((row) => row.track === name).length ?? 0)
              + (detail?.attachments.filter((row) => row.track === name).length ?? 0);
            return (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={track === name}
                className="lc-tab"
                onClick={() => setTrack(name)}
              >
                {name}
                {counts > 0 && <span className="lc-tab-count">{counts}</span>}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: C.danger, lineHeight: 1.5 }}>{error}</p>
      )}

      {/* ---- documents ---- */}
      <section>
        <header style={{ display: 'flex', alignItems: 'center', gap: space(1), marginBottom: space(1.5) }}>
          <h3 style={{ ...SECTION_TITLE, flex: 1 }}>Documents {attachments.length > 0 && `(${attachments.length})`}</h3>
          <button type="button" className="lc-btn lc-btn--sm" disabled={saving} onClick={() => fileRef.current?.click()}>
            <Upload size={14} aria-hidden /> Upload
          </button>
          <button type="button" className="lc-btn lc-btn--sm" disabled={saving} onClick={() => setLinkOpen((was) => !was)}>
            <Link2 size={14} aria-hidden /> Link
          </button>
          <input
            ref={fileRef}
            type="file"
            style={VISUALLY_HIDDEN}
            aria-label="Choose a file to attach"
            accept="image/*,application/pdf,text/markdown,text/plain,text/csv,.md,.markdown,.txt,.csv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = '';   // the same file can be picked again
            }}
          />
        </header>

        {linkOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space(1), marginBottom: space(1.5) }}>
            <label htmlFor={linkId} style={VISUALLY_HIDDEN}>Link address</label>
            <input
              id={linkId}
              className="lc-input"
              value={url}
              placeholder="https://figma.com/file/..."
              inputMode="url"
              autoFocus
              disabled={saving}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  saveLink();
                }
              }}
            />
            <div style={{ display: 'flex', gap: space(1) }}>
              <input
                className="lc-input"
                value={label}
                maxLength={200}
                placeholder="What is it? (optional)"
                disabled={saving}
                aria-label="Link label"
                onChange={(event) => setLabel(event.target.value)}
              />
              <button type="button" className="lc-btn lc-btn--primary" disabled={saving} onClick={saveLink}>Save</button>
              <button type="button" className="lc-btn" disabled={saving} onClick={() => { setLinkOpen(false); setError(null); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {attachments.length === 0 ? (
          <Empty
            icon={<Paperclip size={18} />}
            title="No documents yet"
            detail="Attach the PRD, the designs, the sign-off mail, or link to where they live."
          />
        ) : (
          <ul className="lc-rows" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {attachments.map((attachment) => (
              <li key={attachment.id} className="lc-row lc-doc">
                {isImage(attachment) ? (
                  // The picture is its own label, so show it rather than describe it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="lc-doc-thumb"
                    src={downloadUrl(attachment.id)}
                    alt=""
                    loading="lazy"
                    aria-hidden
                  />
                ) : attachment.kind === 'link' ? (
                  <span className="lc-doc-tile" aria-hidden style={{ background: '#F3F0FF', color: '#5E4DB2' }}>
                    <Link2 size={16} />
                  </span>
                ) : (
                  <span
                    className="lc-doc-tile lc-doc-tile--type"
                    aria-hidden
                    style={{ background: fileKind(attachment).bg, color: fileKind(attachment).fg }}
                  >
                    {fileKind(attachment).label}
                  </span>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  {opensOutside(attachment) ? (
                    <a
                      className="lc-doc-name"
                      href={attachment.kind === 'link' ? attachment.url ?? '#' : downloadUrl(attachment.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={attachment.label}
                    >
                      {attachment.label}
                    </a>
                  ) : (
                    <button type="button" className="lc-doc-name" title={attachment.label} onClick={() => onOpen(attachment)}>
                      {attachment.label}
                    </button>
                  )}
                  <div className="lc-doc-meta">
                    {/* When it landed is what people scan this list for, so it leads. */}
                    <time className="lc-doc-date" dateTime={attachment.created_at}>
                      {format(parseISO(attachment.created_at), 'd MMM yyyy')}
                    </time>
                    <span aria-hidden className="lc-doc-sep" />
                    <span>{attachment.kind === 'link' ? linkHost(attachment.url) : fileSize(attachment.size_bytes)}</span>
                    <span aria-hidden className="lc-doc-sep" />
                    <span>{attachment.added_by_name ?? attachment.added_by.split('@')[0]}</span>
                  </div>
                </div>

                <span className="lc-row-actions" style={{ display: 'inline-flex' }}>
                  {opensOutside(attachment) ? (
                    <a
                      className="lc-icon-btn"
                      href={attachment.kind === 'link' ? attachment.url ?? '#' : downloadUrl(attachment.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${attachment.label} in a new tab`}
                      title="Open in a new tab"
                    >
                      <ExternalLink size={15} />
                    </a>
                  ) : (
                    <a
                      className="lc-icon-btn"
                      href={downloadUrl(attachment.id)}
                      download={attachment.label}
                      aria-label={`Download ${attachment.label}`}
                      title="Download"
                    >
                      <Download size={15} />
                    </a>
                  )}
                  {canRemove(attachment.added_by) && (
                    <button
                      type="button"
                      className="lc-icon-btn"
                      aria-label={`Remove ${attachment.label}`}
                      title="Remove"
                      disabled={saving}
                      onClick={() => onRemoveAttachment(attachment)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- remarks ---- */}
      <section>
        <h3 style={{ ...SECTION_TITLE, marginBottom: space(1.5) }}>
          Remarks {remarks.length > 0 && `(${remarks.length})`}
        </h3>

        <div style={{ display: 'flex', gap: space(1), marginBottom: space(2) }}>
          <label htmlFor={remarkId} style={VISUALLY_HIDDEN}>Add a remark</label>
          <textarea
            id={remarkId}
            className="lc-input"
            rows={2}
            value={body}
            maxLength={4000}
            placeholder="What happened, what was decided, what is holding it up"
            disabled={saving || sending}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              // Enter posts; Shift+Enter is a new line, as everywhere else.
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                sendRemark();
              }
            }}
          />
          <span title={body.trim() ? undefined : 'Write something first'} style={{ display: 'inline-flex', alignItems: 'flex-start' }}>
            <button
              type="button"
              className="lc-btn lc-btn--primary"
              aria-label="Post remark"
              disabled={saving || sending || !body.trim()}
              onClick={sendRemark}
            >
              <Send size={15} aria-hidden />
            </button>
          </span>
        </div>

        {remarks.length === 0 ? (
          <Empty
            icon={<FileText size={18} />}
            title="No remarks yet"
            detail="Remarks are kept with who wrote them and when. Nothing here is overwritten."
          />
        ) : (
          <ol className="lc-trail lc-trail-group" style={{ paddingBottom: 0 }}>
            {remarks.map((remark) => {
              const who = remark.author_name ?? remark.author_email.split('@')[0];
              const at = parseISO(remark.created_at);
              return (
                <li key={remark.id} className="lc-trail-item">
                  <div style={{ display: 'flex', gap: space(1), alignItems: 'flex-start' }}>
                    <Avatar name={who} size={24} colorful />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: space(1) }}>
                        <strong style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{who}</strong>
                        <span style={{ fontSize: 11, color: C.textMuted }}>
                          {format(at, 'd MMM')} · {IST_TIME.format(at)} IST
                        </span>
                        {canRemove(remark.author_email) && (
                          <span className="lc-row-actions" style={{ marginLeft: 'auto' }}>
                            <button
                              type="button"
                              className="lc-icon-btn"
                              aria-label="Remove this remark"
                              title="Remove"
                              disabled={saving}
                              onClick={() => onRemoveRemark(remark)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: 13, color: C.textBody, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {remark.body}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Empty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div style={{ padding: `${space(2)}px ${space(2)}px`, background: C.surfaceSunken, borderRadius: RADIUS.xl, textAlign: 'center' }}>
      <span aria-hidden style={{ display: 'inline-flex', color: C.textDisabled }}>{icon}</span>
      <p style={{ margin: `${space(0.5)}px 0 0`, fontSize: 13, fontWeight: 600, color: C.text }}>{title}</p>
      <p style={{ margin: '3px 0 0', fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{detail}</p>
    </div>
  );
}
