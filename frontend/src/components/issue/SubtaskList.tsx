'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { subtasksAPI, Subtask, SubtaskPriority } from '../../lib/api/subtasks';
import { ticketsAPI } from '../../lib/api/tickets';
import { emitTicketsChanged } from '../../lib/ticketEvents';
import { tokens } from '../../design-system/tokens';
import SubtaskItem from './SubtaskItem';
import { ButtonCore } from '@/components/ui';
import CreateSubtaskModal from './CreateSubtaskModal';
import DoneEvidenceModal from '../DoneEvidenceModal';

/**
 * Distinctive fragment of the backend's Done-evidence rejection (DONE_EVIDENCE_MESSAGE).
 * The subtask model exposes no merge-request field to pre-check, so we detect the block
 * from the error and then collect evidence via the modal.
 */
const DONE_EVIDENCE_ERROR_FRAGMENT = "can't be marked as Done";

interface SubtaskListProps {
  projectId: number;
  parentIssueId: number;
  canEdit: boolean;
  onSubtaskClick: (subtaskId: number) => void;
  /** Bump to force a re-fetch — e.g. after a subtask is edited in its own modal. */
  refreshKey?: number;
}

export default function SubtaskList({
  projectId,
  parentIssueId,
  canEdit,
  onSubtaskClick,
  refreshKey = 0,
}: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [quickAddActive, setQuickAddActive] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  // Set when completing a subtask is blocked for lack of evidence; drives the evidence modal.
  const [doneEvidenceCtx, setDoneEvidenceCtx] = useState<{ subtaskId: number; subtaskKey: string } | null>(null);

  // Initial load shows a spinner; refreshKey-driven reloads are silent so the list
  // doesn't flash "Loading…" when a nested subtask modal closes.
  useEffect(() => {
    loadSubtasks();
  }, [projectId, parentIssueId]);

  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    loadSubtasks({ silent: true });
  }, [refreshKey]);

  const loadSubtasks = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setLoading(true);
      // Include archived subtasks so they can be shown greyed-out with a restore
      // action - otherwise an archived subtask is reachable from nowhere in the UI.
      const data = await subtasksAPI.list(projectId, parentIssueId, true);
      setSubtasks(data);
    } catch (error) {
      console.error('Failed to load subtasks:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSubtaskCreated = async (subtaskId: number) => {
    await loadSubtasks();
    // Open the detail modal for the newly created subtask
    onSubtaskClick(subtaskId);
  };

  const handleToggleComplete = async (subtaskId: number, completed: boolean) => {
    try {
      await subtasksAPI.toggleComplete(projectId, parentIssueId, subtaskId, completed);
      await loadSubtasks();
    } catch (error) {
      // Completing a subtask can be blocked until it has a merge request link or a comment.
      // Open the evidence modal to collect one, then finish the completion.
      if (
        completed &&
        error instanceof Error &&
        error.message.includes(DONE_EVIDENCE_ERROR_FRAGMENT)
      ) {
        const st = subtasks.find((s) => s.id === subtaskId);
        setDoneEvidenceCtx({ subtaskId, subtaskKey: st?.key || `#${subtaskId}` });
        return;
      }
      console.error('Failed to toggle subtask:', error);
      throw error;
    }
  };

  // Save the evidence the user entered onto the subtask, then complete it.
  const submitDoneEvidence = async ({
    mergeRequestUrl,
    comment,
  }: {
    mergeRequestUrl: string;
    comment: string;
  }) => {
    if (!doneEvidenceCtx) return;
    const { subtaskId } = doneEvidenceCtx;
    try {
      // A subtask is a ticket under the hood, so its id is the ticket number: the
      // ticket endpoints accept the MR link and comment keyed by it.
      if (mergeRequestUrl) {
        await ticketsAPI.updateTicket(projectId, subtaskId, { merge_request_url: mergeRequestUrl });
      }
      if (comment) {
        await ticketsAPI.addComment(projectId, subtaskId, comment);
      }
      await subtasksAPI.toggleComplete(projectId, parentIssueId, subtaskId, true);
      await loadSubtasks();
      setDoneEvidenceCtx(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to complete subtask.');
      throw error; // keep the modal open so the user can retry
    }
  };

  /**
   * Promote a subtask to a standalone issue. One call detaches the parent and
   * gives it a real type; leaving it typed `subtask` with no parent would hide it
   * from the board, which filters subtasks out of the listing.
   */
  const handlePromote = async (subtaskId: number) => {
    await ticketsAPI.promoteToIssue(projectId, subtaskId);
    await loadSubtasks();
    // It is a board issue now, so the board and backlog need to hear about it.
    emitTicketsChanged(projectId);
  };

  const handleDeleteSubtask = async (subtaskId: number) => {
    try {
      await subtasksAPI.delete(projectId, parentIssueId, subtaskId);
      await loadSubtasks();
    } catch (error) {
      console.error('Failed to delete subtask:', error);
      throw error;
    }
  };

  // A subtask is a ticket under the hood, so unarchiving goes through the ticket
  // endpoint keyed by its id. Tell the board/backlog so the parent card's count updates.
  const handleUnarchiveSubtask = async (subtaskId: number) => {
    try {
      await ticketsAPI.unarchiveTicket(projectId, subtaskId);
      await loadSubtasks();
      emitTicketsChanged(projectId);
    } catch (error) {
      console.error('Failed to unarchive subtask:', error);
      throw error;
    }
  };

  const handleChangePriority = async (subtaskId: number, priority: SubtaskPriority) => {
    // Optimistic update so the chip reflects the choice immediately.
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, priority } : s))
    );
    try {
      await subtasksAPI.update(projectId, parentIssueId, subtaskId, { priority });
    } catch (error) {
      console.error('Failed to update subtask priority:', error);
      alert('Failed to update subtask priority');
      await loadSubtasks(); // revert to server state
    }
  };

  const handleQuickAddSubmit = async () => {
    const title = quickAddTitle.trim();
    if (!title || quickAddSaving) return;
    setQuickAddSaving(true);
    try {
      await subtasksAPI.create(projectId, parentIssueId, { title });
      setQuickAddTitle('');
      await loadSubtasks();
      // keep input focused for next add
      requestAnimationFrame(() => quickAddInputRef.current?.focus());
    } catch (error) {
      console.error('Failed to create subtask:', error);
      alert('Failed to create subtask. Please try again.');
    } finally {
      setQuickAddSaving(false);
    }
  };

  const handleQuickAddCancel = () => {
    setQuickAddActive(false);
    setQuickAddTitle('');
  };

  // Archived subtasks are shown for restore only; they don't count toward progress
  // (mirrors the parent card's rollup, which also excludes archived).
  const activeSubtasks = subtasks.filter((s) => !s.archived);
  const archivedSubtasks = subtasks.filter((s) => s.archived);
  const completedCount = activeSubtasks.filter((s) => s.completed).length;
  const totalCount = activeSubtasks.length;
  const completionPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: tokens.colors.neutral[500] }}>
        Loading subtasks...
      </div>
    );
  }

  return (
    <div>
      {/* Header with Progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: tokens.colors.neutral[900] }}>
              Subtasks
            </h4>
            {totalCount > 0 && (
              <span style={{ fontSize: 13, color: tokens.colors.neutral[600] }}>
                {completedCount} / {totalCount}
              </span>
            )}
          </div>
          {canEdit && (
            <ButtonCore
              variant="secondary"
              size="sm"
              onClick={() => setShowCreateModal(true)}
              leftIcon={<Plus size={14} />}
            >
              Add subtask
            </ButtonCore>
          )}
        </div>

        {/* Progress Bar */}
        {totalCount > 0 && (
          <div
            style={{
              width: '100%',
              height: 6,
              backgroundColor: tokens.colors.neutral[200],
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${completionPercentage}%`,
                height: '100%',
                backgroundColor: tokens.colors.success[500],
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        )}
      </div>

      {/* Subtasks List */}
      {subtasks.length === 0 ? (
        <div
          style={{
            padding: '16px',
            textAlign: 'center',
            color: tokens.colors.neutral[500],
            fontSize: 13,
            backgroundColor: tokens.colors.neutral[50],
            borderRadius: 8,
            border: `1px dashed ${tokens.colors.neutral[300]}`,
          }}
        >
          No subtasks yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeSubtasks.map((subtask) => (
            <SubtaskItem
              key={subtask.id}
              subtask={subtask}
              onToggleComplete={handleToggleComplete}
              onDelete={handleDeleteSubtask}
              onPromote={canEdit ? handlePromote : undefined}
              onUnarchive={canEdit ? handleUnarchiveSubtask : undefined}
              onOpenDetail={onSubtaskClick}
              onChangePriority={handleChangePriority}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}

      {/* Inline quick-add row — low-friction, title-only; the header button opens the full modal */}
      {canEdit && (
        <div style={{ marginTop: 8 }}>
          {quickAddActive ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                border: `1px solid ${tokens.colors.primary[500]}`,
                borderRadius: 6,
                backgroundColor: '#FFFFFF',
              }}
            >
              <Plus size={14} color={tokens.colors.neutral[500]} />
              <input
                ref={quickAddInputRef}
                autoFocus
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleQuickAddSubmit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleQuickAddCancel();
                  }
                }}
                onBlur={() => {
                  // If user clicks away without text, collapse the row
                  if (!quickAddTitle.trim() && !quickAddSaving) {
                    setQuickAddActive(false);
                  }
                }}
                placeholder="Subtask title (Enter to save, Esc to cancel)"
                disabled={quickAddSaving}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: 14,
                  color: tokens.colors.neutral[900],
                  background: 'transparent',
                  fontFamily: 'inherit',
                }}
              />
              {quickAddSaving && (
                <span style={{ fontSize: 12, color: tokens.colors.neutral[500] }}>Saving…</span>
              )}
            </div>
          ) : (
            <button
              onClick={() => setQuickAddActive(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                border: `1px dashed ${tokens.colors.neutral[300]}`,
                borderRadius: 6,
                background: 'transparent',
                color: tokens.colors.neutral[600],
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
                e.currentTarget.style.borderColor = tokens.colors.primary[400];
                e.currentTarget.style.color = tokens.colors.primary[600];
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = tokens.colors.neutral[300];
                e.currentTarget.style.color = tokens.colors.neutral[600];
              }}
            >
              <Plus size={14} />
              Add subtask
            </button>
          )}
        </div>
      )}

      {/* Archived subtasks: shown below the add-subtask row so the quick-add never
          looks like it adds to the archived group. Kept visible for restore, but set
          apart with a label and a muted, greyed-out row style. */}
      {archivedSubtasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: tokens.colors.neutral[500],
            }}
          >
            Archived
            <span style={{ fontWeight: 500 }}>{archivedSubtasks.length}</span>
          </div>
          {archivedSubtasks.map((subtask) => (
            <SubtaskItem
              key={subtask.id}
              subtask={subtask}
              onToggleComplete={handleToggleComplete}
              onDelete={handleDeleteSubtask}
              onPromote={canEdit ? handlePromote : undefined}
              onUnarchive={canEdit ? handleUnarchiveSubtask : undefined}
              onOpenDetail={onSubtaskClick}
              onChangePriority={handleChangePriority}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}

      {/* Create Subtask Modal */}
      <CreateSubtaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        projectId={projectId}
        parentIssueId={parentIssueId}
        onSubtaskCreated={handleSubtaskCreated}
      />

      {/* Evidence prompt shown when completing a subtask is blocked for lack of an MR link/comment */}
      {doneEvidenceCtx && (
        <DoneEvidenceModal
          isOpen
          ticketKey={doneEvidenceCtx.subtaskKey}
          onClose={() => setDoneEvidenceCtx(null)}
          onSubmit={submitDoneEvidence}
        />
      )}
    </div>
  );
}
