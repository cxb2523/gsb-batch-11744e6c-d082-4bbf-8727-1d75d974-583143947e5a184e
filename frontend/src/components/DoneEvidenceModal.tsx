"use client";

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ButtonCore } from '@/components/ui';
import { tokens } from '@/design-system/tokens';

/** Status names that count as "done" — kept in sync with the backend gate. */
export const DONE_STATUS_NAMES = ['Done', 'Closed', 'Completed'];

/**
 * Status names that require evidence of the work (an MR link or a comment) before a
 * ticket may enter them. Mirrors EVIDENCE_REQUIRED_STATUS_NAMES on the backend.
 */
export const EVIDENCE_REQUIRED_STATUS_NAMES = [...DONE_STATUS_NAMES, 'In Review', 'Testing'];

export interface DoneEvidenceModalProps {
  isOpen: boolean;
  /** Called on cancel / overlay / X. The status change should NOT happen. */
  onClose: () => void;
  /**
   * Called when the user confirms with at least one field filled. Should perform
   * the save + status change. If it throws, the modal stays open so the user can retry.
   * The parent closes the modal by flipping `isOpen` after this resolves.
   */
  onSubmit: (data: { mergeRequestUrl: string; comment: string }) => Promise<void>;
  ticketKey: string;
  /** The status the ticket is moving into (e.g. "In Review", "Testing", "Done"). */
  targetStatusName?: string;
  /** Prefill for the MR field (e.g. a value the user was typing elsewhere). */
  initialMergeRequestUrl?: string;
}

const DoneEvidenceModal: React.FC<DoneEvidenceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  ticketKey,
  targetStatusName = 'Done',
  initialMergeRequestUrl = '',
}) => {
  const [mergeRequestUrl, setMergeRequestUrl] = useState(initialMergeRequestUrl);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMergeRequestUrl(initialMergeRequestUrl);
      setComment('');
    }
  }, [isOpen, initialMergeRequestUrl]);

  if (!isOpen) return null;

  const canSubmit = (mergeRequestUrl.trim() !== '' || comment.trim() !== '') && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ mergeRequestUrl: mergeRequestUrl.trim(), comment: comment.trim() });
      // Parent closes the modal on success; nothing else to do here.
    } catch {
      // Keep the modal open so the user can adjust and retry; the parent surfaces the error.
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
    color: tokens.colors.neutral[900],
  };

  const fieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = tokens.colors.primary[500];
    e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[100]}`;
  };
  const fieldBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = tokens.colors.neutral[300];
    e.currentTarget.style.boxShadow = 'none';
  };
  const fieldBase: React.CSSProperties = {
    width: '100%',
    padding: 10,
    fontSize: 14,
    fontFamily: tokens.fontFamily.sans,
    border: `1px solid ${tokens.colors.neutral[300]}`,
    borderRadius: 6,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(9, 30, 66, 0.54)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Must sit above TicketDetailModal (overlay ~9999, nested elements up to 100010),
        // since this modal can be opened from inside it.
        zIndex: 100020,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 8,
          maxWidth: 480,
          width: '100%',
          boxShadow: tokens.shadows.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: tokens.colors.neutral[900] }}>
              Move {ticketKey} to {targetStatusName}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: tokens.colors.neutral[600] }}>
              Add a merge request link or a short comment so there&apos;s a record of the work.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              borderRadius: 4,
              display: 'flex',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = tokens.colors.neutral[100])}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={18} color={tokens.colors.neutral[600]} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: 20 }}>
            <div>
              <label htmlFor="done-mr-url" style={labelStyle}>
                Merge request / PR link
              </label>
              <input
                id="done-mr-url"
                type="url"
                value={mergeRequestUrl}
                onChange={(e) => setMergeRequestUrl(e.target.value)}
                placeholder="https://github.com/org/repo/pull/123"
                style={fieldBase}
                onFocus={fieldFocus}
                onBlur={fieldBlur}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
              <div style={{ flex: 1, height: 1, background: tokens.colors.neutral[200] }} />
              <span style={{ fontSize: 12, color: tokens.colors.neutral[500], fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: 1, background: tokens.colors.neutral[200] }} />
            </div>

            <div>
              <label htmlFor="done-comment" style={labelStyle}>
                Comment
              </label>
              <textarea
                id="done-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g. No code change needed — verified in staging."
                style={{ ...fieldBase, minHeight: 88, resize: 'vertical' }}
                onFocus={fieldFocus}
                onBlur={fieldBlur}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '14px 20px',
              borderTop: `1px solid ${tokens.colors.neutral[200]}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <ButtonCore variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </ButtonCore>
            <ButtonCore type="submit" variant="primary" disabled={!canSubmit}>
              {isSubmitting ? 'Saving…' : `Move to ${targetStatusName}`}
            </ButtonCore>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DoneEvidenceModal;
