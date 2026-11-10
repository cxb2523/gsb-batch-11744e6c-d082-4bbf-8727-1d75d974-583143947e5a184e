'use client';

import React from 'react';
import { CornerDownRight, Trash2 } from 'lucide-react';
import type { BlockerNote } from '@/lib/api/standup';
import { C, IST_TIME, RADIUS, space } from './tokens';

export const isPending = (item: { id: string }) => item.id.startsWith('pending-');

interface Props {
  notes: BlockerNote[];
  /** Display name for an author email. */
  nameFor: (email: string) => string;
  readOnly: boolean;
  onRemove: (note: BlockerNote) => void;
}

/** Free-text blockers as plain cards. */
export function BlockerNotes({ notes, nameFor, readOnly, onRemove }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space(1), padding: `${space(0.5)}px ${space(0.5)}px` }}>
      {notes.map((note) => {
        const pending = isPending(note);
        return (
          <div
            key={note.id}
            style={{
              position: 'relative',
              padding: `${space(1)}px ${space(1.5)}px`,
              paddingRight: readOnly || pending ? space(1.5) : 44,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: RADIUS.md,
              opacity: pending ? 0.7 : 1,
            }}
          >
            <div style={{ fontSize: 14, lineHeight: '20px', color: C.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.text}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: C.textMuted, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span>
                {pending ? 'Saving…' : `${note.created_by ? nameFor(note.created_by) : 'Someone'} · ${IST_TIME.format(new Date(note.created_at))}`}
              </span>
              {note.carried_from_date && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CornerDownRight size={11} aria-hidden /> Carried over
                </span>
              )}
            </div>
            {!readOnly && !pending && (
              <button
                type="button"
                className="su-icon-btn"
                aria-label={`Delete blocker: ${note.text.slice(0, 60)}`}
                title="Delete blocker"
                onClick={() => onRemove(note)}
                style={{ position: 'absolute', top: 2, right: 2 }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
