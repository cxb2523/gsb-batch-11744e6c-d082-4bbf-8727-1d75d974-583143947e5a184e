import React from 'react';
import { tokens } from '../../../../../design-system/tokens';
import { ConfirmDialog } from '../../../../../components/ui';
import { IssueCardData } from '../../../../../components/board/IssueCard';
import type { TicketDeleteImpact } from '../../../../../lib/api/tickets';

interface CardDeleteDialogProps {
  cardDeleteId: number | null;
  cardDeleteTicket?: IssueCardData;
  cardDeleteImpact: TicketDeleteImpact | null;
  cardDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CardDeleteDialog({
  cardDeleteId,
  cardDeleteTicket,
  cardDeleteImpact,
  cardDeleting,
  onConfirm,
  onCancel,
}: CardDeleteDialogProps) {
  return (
    <ConfirmDialog
      isOpen={cardDeleteId !== null}
      title={`Delete ${cardDeleteTicket?.key ?? 'issue'}?`}
      destructive
      busy={cardDeleting}
      confirmLabel={cardDeleting ? 'Deleting...' : 'Delete permanently'}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p style={{ margin: '0 0 8px' }}>
        This permanently deletes the issue and everything on it. This cannot be undone.
      </p>
      {cardDeleteImpact &&
        (cardDeleteImpact.subtasks > 0 ||
        cardDeleteImpact.comments > 0 ||
        cardDeleteImpact.attachments > 0 ||
        cardDeleteImpact.worklogs > 0 ? (
          <div
            style={{
              backgroundColor: tokens.colors.error[50],
              border: `1px solid ${tokens.colors.error[200]}`,
              borderRadius: 6,
              padding: '10px 12px',
              marginBottom: 12,
              fontSize: 13,
              color: tokens.colors.error[700],
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>This will also delete:</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              {cardDeleteImpact.subtasks > 0 && (
                <li>
                  <strong>{cardDeleteImpact.subtasks}</strong> subtask
                  {cardDeleteImpact.subtasks === 1 ? '' : 's'}
                </li>
              )}
              {cardDeleteImpact.comments > 0 && (
                <li>
                  {cardDeleteImpact.comments} comment{cardDeleteImpact.comments === 1 ? '' : 's'}
                </li>
              )}
              {cardDeleteImpact.attachments > 0 && (
                <li>
                  {cardDeleteImpact.attachments} attachment
                  {cardDeleteImpact.attachments === 1 ? '' : 's'}
                </li>
              )}
              {cardDeleteImpact.worklogs > 0 && (
                <li>
                  {cardDeleteImpact.worklogs} worklog{cardDeleteImpact.worklogs === 1 ? '' : 's'}
                  {cardDeleteImpact.time_spent_seconds > 0 &&
                    ` (${(cardDeleteImpact.time_spent_seconds / 3600).toFixed(1)}h logged)`}
                </li>
              )}
            </ul>
          </div>
        ) : null)}
      <p style={{ margin: 0, fontSize: 13, color: tokens.colors.neutral[500] }}>
        To keep it but hide it from the board, use <strong>Archive</strong> instead.
      </p>
    </ConfirmDialog>
  );
}
