import { useCallback, useState } from 'react';
import type React from 'react';
import { IssueCardData } from '../components/board/IssueCard';
import { WorkflowStatus } from '../lib/api/settings';
import { ticketsAPI } from '../lib/api/tickets';
import { canMoveTo, transitionBlockReason } from '../lib/statusFlow';
import { EVIDENCE_REQUIRED_STATUS_NAMES } from '../components/DoneEvidenceModal';
import { useToast } from '../components/ui';

export interface DoneEvidenceCtx {
  ticketId: number;
  ticketKey: string;
  targetStatusId: number;
}

interface UseTicketBoardArgs {
  projectId: number;
  statuses: WorkflowStatus[];
  /** Current cards on the board (IssueCardData from the shared translator). */
  tickets: IssueCardData[];
  setTickets: React.Dispatch<React.SetStateAction<IssueCardData[]>>;
  /** Status moves are only allowed when the board isn't grouped by assignee/epic. */
  groupBy: string;
  /** Optional hook run after a successful move (e.g. refresh sprint capacity). */
  /**
   * Called once the server has accepted a move. Receives what moved and where,
   * so a caller holding per-column state can correct it without refetching the
   * board - which would otherwise throw away any extra pages already loaded.
   */
  onAfterMove?: (move: {
    ticketId: number;
    fromStatusId?: number;
    toStatusId: number;
  }) => void | Promise<void>;
}

/**
 * Single source of truth for drag-to-move-status behavior shared by the board and
 * sprint pages. Owns: drag state, the one-step transition cap (lib/statusFlow), the
 * evidence gate (DoneEvidenceModal), the optimistic move + revert, and uniform toast
 * error surfacing. Both pages render the shared BoardColumn + DoneEvidenceModal and
 * wire them to what this returns, so the two boards never diverge again.
 */
export function useTicketBoard({
  projectId,
  statuses,
  tickets,
  setTickets,
  groupBy,
  onAfterMove,
}: UseTicketBoardArgs) {
  const toast = useToast();
  const [draggedIssue, setDraggedIssue] = useState<IssueCardData | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<number | null>(null);
  const [doneEvidenceCtx, setDoneEvidenceCtx] = useState<DoneEvidenceCtx | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, issue: IssueCardData) => {
    setDraggedIssue(issue);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', issue.id.toString());
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIssue(null);
    setDragOverStatusId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnId: number | string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Only track drag-over for status columns.
    if (groupBy === 'none' && typeof columnId === 'number') {
      setDragOverStatusId(columnId);
    } else if (typeof columnId === 'string') {
      setDragOverStatusId(Number(columnId));
    }
  }, [groupBy]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverStatusId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetColumnId: number | string) => {
    e.preventDefault();
    setDragOverStatusId(null);

    if (!draggedIssue) return;

    // Only allow status changes when grouping by status (none).
    if (groupBy !== 'none') {
      setDraggedIssue(null);
      return;
    }

    const targetStatusId = typeof targetColumnId === 'string' ? Number(targetColumnId) : targetColumnId;

    const currentIssue = tickets.find((t) => t.id === draggedIssue.id);
    if (!currentIssue || currentIssue.statusId === undefined) return;

    if (currentIssue.statusId === targetStatusId) {
      setDraggedIssue(null);
      return;
    }

    // Cap forward jumps: a card may move at most one step forward (any number back,
    // and to/from Blocked freely). The backend enforces this too; reject early with a
    // friendly toast so the card never appears to move.
    if (!canMoveTo(statuses, currentIssue.statusId, targetStatusId, currentIssue.preBlockStatusId)) {
      toast.error(
        transitionBlockReason(statuses, currentIssue.statusId, targetStatusId, currentIssue.preBlockStatusId)
          || 'You can only move a ticket one step forward.'
      );
      setDraggedIssue(null);
      return;
    }

    // Gate: a ticket can't enter an evidence-required status (In Review, Testing, Done, …)
    // without a merge request link. If it has none, hold the move and ask for an MR link or
    // a comment (DoneEvidenceModal). Only prompt on entry from a non-evidence status, so the
    // normal In Review -> Testing hand-off isn't re-prompted.
    const targetStatus = statuses.find((s) => s.id === targetStatusId);
    const currentStatus = statuses.find((s) => s.id === currentIssue.statusId);
    const wasEvidenceStatus = !!currentStatus && EVIDENCE_REQUIRED_STATUS_NAMES.includes(currentStatus.name);
    if (
      targetStatus &&
      EVIDENCE_REQUIRED_STATUS_NAMES.includes(targetStatus.name) &&
      !wasEvidenceStatus &&
      !(currentIssue.mergeRequestUrl || '').trim()
    ) {
      setDoneEvidenceCtx({
        ticketId: draggedIssue.id,
        ticketKey: draggedIssue.key,
        targetStatusId,
      });
      setDraggedIssue(null);
      return;
    }

    // Apply the move straight away. Dropping a card is already an unambiguous
    // statement of intent — interrupting it with a dialog turned a one-second gesture
    // into a form.
    const previousStatusId = currentIssue.statusId;
    const movedId = draggedIssue.id;
    const movedKey = draggedIssue.key;
    setTickets((prev) =>
      prev.map((t) => (t.id === movedId ? { ...t, statusId: targetStatusId } : t))
    );
    setDraggedIssue(null);

    try {
      await ticketsAPI.moveTicket(projectId, movedId, targetStatusId);
      await onAfterMove?.({
        ticketId: movedId,
        fromStatusId: previousStatusId,
        toStatusId: targetStatusId,
      });
    } catch (err) {
      // Put the card back where it came from; a card that silently stayed moved
      // while the server disagreed would be worse than the interruption.
      setTickets((prev) =>
        prev.map((t) => (t.id === movedId ? { ...t, statusId: previousStatusId } : t))
      );
      toast.error(err instanceof Error ? err.message : `Could not move ${movedKey}.`);
    }
  }, [draggedIssue, groupBy, tickets, statuses, projectId, toast, setTickets, onAfterMove]);

  // onSubmit for DoneEvidenceModal: record the evidence, then perform the held move.
  const submitDoneEvidence = useCallback(
    async ({ mergeRequestUrl, comment }: { mergeRequestUrl: string; comment: string }) => {
      if (!doneEvidenceCtx) return;
      const { ticketId, targetStatusId } = doneEvidenceCtx;
      try {
        if (mergeRequestUrl) {
          await ticketsAPI.updateTicket(projectId, ticketId, { merge_request_url: mergeRequestUrl });
        }
        if (comment) {
          await ticketsAPI.addComment(projectId, ticketId, comment);
        }
        const fromStatusId = tickets.find((t) => t.id === ticketId)?.statusId;
        await ticketsAPI.moveTicket(projectId, ticketId, targetStatusId);
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId
              ? { ...t, statusId: targetStatusId, mergeRequestUrl: mergeRequestUrl || t.mergeRequestUrl }
              : t
          )
        );
        setDoneEvidenceCtx(null);
        await onAfterMove?.({ ticketId, fromStatusId, toStatusId: targetStatusId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not move the ticket.');
        throw err; // keep the modal open so the user can retry
      }
    },
    [doneEvidenceCtx, projectId, setTickets, tickets, toast, onAfterMove],
  );

  /** True when a card is being dragged that can't legally drop on this status column. */
  const isDropBlocked = useCallback(
    (columnId: number | string): boolean =>
      groupBy === 'none' &&
      draggedIssue !== null &&
      draggedIssue.statusId !== Number(columnId) &&
      !canMoveTo(statuses, draggedIssue.statusId, Number(columnId), draggedIssue.preBlockStatusId),
    [groupBy, draggedIssue, statuses],
  );

  return {
    draggedIssue,
    dragOverStatusId,
    doneEvidenceCtx,
    setDoneEvidenceCtx,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    submitDoneEvidence,
    isDropBlocked,
  };
}
