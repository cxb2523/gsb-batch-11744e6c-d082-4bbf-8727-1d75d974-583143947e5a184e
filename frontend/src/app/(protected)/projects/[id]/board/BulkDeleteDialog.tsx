import React from 'react';
import { tokens } from '../../../../../design-system/tokens';
import { ConfirmDialog } from '../../../../../components/ui';

interface BulkDeleteDialogProps {
  isOpen: boolean;
  count: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BulkDeleteDialog({ isOpen, count, busy, onConfirm, onCancel }: BulkDeleteDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={`Delete ${count} issue${count === 1 ? '' : 's'}?`}
      destructive
      busy={busy}
      confirmLabel={busy ? 'Deleting...' : 'Delete permanently'}
      onConfirm={onConfirm}
      onCancel={onCancel}
      width={420}
    >
      <p style={{ margin: '0 0 8px' }}>
        This permanently deletes them along with their subtasks, comments, attachments and logged
        time. This cannot be undone.
      </p>
      <p style={{ margin: 0, fontSize: 13, color: tokens.colors.neutral[500] }}>
        Only issues you reported can be deleted, unless you are an admin. To keep them but hide
        them from the board, use <strong>Archive</strong> instead.
      </p>
    </ConfirmDialog>
  );
}
