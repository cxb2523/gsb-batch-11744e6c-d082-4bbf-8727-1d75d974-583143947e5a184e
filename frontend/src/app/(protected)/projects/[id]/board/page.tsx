'use client';

import React from 'react';
import { tokens } from '../../../../../design-system/tokens';
import CreateIssueModal from '../../../../../components/CreateIssueModal';
import TicketDetailModal from '../../../../../components/TicketDetailModal';
import { BoardToolbar } from '../../../../../components/board/BoardToolbar';
import { BoardColumn } from '../../../../../components/board/BoardColumn';
import { BulkActionBar } from '../../../../../components/board/BulkActionBar';
import DoneEvidenceModal from '../../../../../components/DoneEvidenceModal';
import { DEFAULT_BOARD_FILTERS } from '../../../../../lib/boardFilters';
import { ActiveFilterChips } from '../../../../../components/board/ActiveFilterChips';
import { useBoardPage } from './useBoardPage';
import { CardDeleteDialog } from './CardDeleteDialog';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { NoFilterMatchBanner } from './NoFilterMatchBanner';

export default function BoardPage() {
  const b = useBoardPage();

  // Loading state
  if (b.loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: '#FBFBFC',
          fontFamily: tokens.fontFamily.sans,
        }}
      >
        <div style={{ fontSize: '14px', color: '#5E6C84' }}>Loading board...</div>
      </div>
    );
  }

  // Error state
  if (b.error) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: '#FBFBFC',
          fontFamily: tokens.fontFamily.sans,
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '24px',
            backgroundColor: '#FFFFFF',
            borderRadius: '3px',
            border: '1px solid #DFE1E6',
            maxWidth: '400px',
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#E34935', marginBottom: '8px' }}>
            Error
          </div>
          <div style={{ fontSize: '14px', color: '#5E6C84', marginBottom: '16px' }}>
            {b.error}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#0052CC',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '3px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (b.statuses.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: '#FBFBFC',
          fontFamily: tokens.fontFamily.sans,
        }}
      >
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#172B4D', marginBottom: '8px' }}>
            No workflow statuses found
          </div>
          <div style={{ fontSize: '14px', color: '#5E6C84', marginBottom: '16px' }}>
            Please configure workflow statuses in project settings to use the board.
          </div>
          <button
            onClick={() => (window.location.href = `/settings/workflow`)}
            style={{
              backgroundColor: '#0052CC',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '3px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FBFBFC',
        fontFamily: tokens.fontFamily.sans,
      }}
    >
      {/* Toolbar */}
      <BoardToolbar
        boardName={b.boardName}
        isEditingName={b.isEditingName}
        onNameChange={b.setBoardName}
        onToggleEditName={() => b.setIsEditingName(!b.isEditingName)}
        searchQuery={b.searchDraft}
        onSearchChange={b.setSearchDraft}
        assigneeFilter={b.assigneeFilter}
        onAssigneeFilterChange={(v) => b.setFilter('assignee', v)}
        assignees={b.assigneeOptions}
        typeFilter={b.typeFilter}
        onTypeFilterChange={(v) => b.setFilter('type', v)}
        types={b.typeOptions}
        epicFilter={b.epicFilter}
        onEpicFilterChange={(v) => b.setFilter('epic', v)}
        epics={b.epicOptions}
        priorityFilter={b.priorityFilter}
        onPriorityFilterChange={(v) => b.setFilter('priority', v)}
        priorities={b.priorityOptions}
        labelFilter={b.labelFilter}
        onLabelFilterChange={(v) => b.setFilter('label', v)}
        labels={b.labelOptions}
        sprintFilter={b.sprintFilter}
        onSprintFilterChange={(v) => b.setFilter('sprint', v)}
        sprints={b.sprintOptions}
        groupBy={b.groupBy}
        onGroupByChange={(v) => b.setFilter('groupBy', v)}
        showArchived={b.showArchived}
        onToggleArchived={() => b.setFilter('showArchived', !b.showArchived)}
      />

      {/* Active filters, spelled out and individually removable */}
      <ActiveFilterChips
        filters={b.filters}
        assignees={b.assigneeOptions}
        types={b.typeOptions}
        epics={b.epicOptions}
        priorities={b.priorityOptions}
        labels={b.labelOptions}
        sprints={b.sprintOptions}
        onRemove={(key) => b.setFilter(key, DEFAULT_BOARD_FILTERS[key] as never)}
        onClearAll={b.clearFilters}
      />

      {/* Nothing matched the filters. Say so, rather than showing a wall of empty
          columns that reads as "we lost your work". The server does the filtering
          now, so an empty result and an empty project look alike from here - the
          active filter count is what tells them apart. */}
      {b.filteredTickets.length === 0 && b.activeFilterCount > 0 && (
        <NoFilterMatchBanner
          hiddenCount={b.tickets.length}
          activeFilterCount={b.activeFilterCount}
          onClear={b.clearFilters}
        />
      )}

      {/* Board Container */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 16,
            height: '100%',
            alignItems: 'flex-start',
          }}
        >
          {b.groupColumns.map((column) => {
            const colKey = String(column.id);
            const columnIssues = b.groupedTickets[column.id] || [];
            // Only persist collapse for status grouping to avoid leaking between view modes
            const collapsible = b.groupBy === 'none';
            const isCollapsed = collapsible && b.collapsedColumns.has(colKey);
            return (
              <BoardColumn
                key={column.id}
                id={column.id}
                name={column.name}
                color={column.color}
                issues={columnIssues}
                onAddIssue={() => {
                  if (b.groupBy === 'none') {
                    b.handleAddIssue(Number(column.id));
                  } else {
                    b.handleAddIssue(b.statuses[0]?.id || 0);
                  }
                }}
                onIssueClick={b.openTicket}
                onDragStart={b.handleDragStart}
                onDragEnd={b.handleDragEnd}
                onDragOver={b.handleDragOver}
                onDragLeave={b.handleDragLeave}
                onDrop={b.handleDrop}
                draggedIssue={b.draggedIssue}
                isDraggingOver={b.dragOverStatusId !== null && (
                  typeof column.id === 'number'
                    ? b.dragOverStatusId === column.id
                    : b.dragOverStatusId === Number(column.id)
                )}
                dropBlocked={b.isDropBlocked(column.id)}
                selectedIds={b.selectedTicketIds}
                onToggleSelect={(issueId, e) => b.handleToggleSelect(issueId, e, columnIssues)}
                issueActions={(issue) => ({
                  // Hidden only when the issue is already assigned to me.
                  onAssignToMe:
                    b.user && (!issue.assignee || issue.assignee.id !== b.currentMember?.user_id)
                      ? () => b.assignToMe(issue.id)
                      : undefined,
                  onCopyLink: () => b.copyIssueLink(issue.id),
                  onToggleArchive: () => b.toggleArchiveIssue(issue.id, !!issue.archived),
                  // Backend allows delete only for the reporter or an admin, so don't
                  // offer it to anyone who would just get a 403.
                  onDelete:
                    b.isAdmin || (b.user && issue.reporterEmail === b.user.email)
                      ? () => b.openCardDelete(issue.id)
                      : undefined,
                })}
                collapsed={isCollapsed}
                onToggleCollapse={collapsible ? () => b.toggleColumnCollapsed(colKey) : undefined}
                totalCount={b.columnTotals[colKey]}
                // A column with no cursor holds nothing further, so it gets no
                // button. Grouping by priority, the catch-all column cannot be
                // expressed as a filter, so it cannot be continued either.
                onLoadMore={b.columnCursors[colKey] ? () => b.loadMoreInColumn(colKey) : undefined}
                loadingMore={b.loadingColumn === colKey}
              />
            );
          })}
        </div>
      </div>

      {/* Bulk action bar */}
      {b.selectedTicketIds.size > 0 && (
        <BulkActionBar
          selectedCount={b.selectedTicketIds.size}
          onClear={b.clearSelection}
          onApply={b.applyBulkUpdate}
          members={b.members}
          statuses={b.statuses}
          selectedTickets={b.tickets
            .filter((t) => b.selectedTicketIds.has(t.id))
            .map((t) => ({ statusId: t.statusId, preBlockStatusId: t.preBlockStatusId }))}
          labels={b.labels}
          sprints={b.boardSprints}
          epics={b.epics}
          onArchive={b.archiveSelected}
          onDelete={() => b.setShowBulkDeleteConfirm(true)}
        />
      )}

      {/* Ask for a merge request link or comment before a card enters an
          evidence-required status (In Review, Testing, Done, …). */}
      {b.doneEvidenceCtx && (
        <DoneEvidenceModal
          isOpen={true}
          ticketKey={b.doneEvidenceCtx.ticketKey}
          targetStatusName={b.statuses.find((s) => s.id === b.doneEvidenceCtx!.targetStatusId)?.name}
          onClose={() => b.setDoneEvidenceCtx(null)}
          onSubmit={b.submitDoneEvidence}
        />
      )}

      {/* Delete a single issue from its card menu */}
      <CardDeleteDialog
        cardDeleteId={b.cardDeleteId}
        cardDeleteTicket={b.cardDeleteTicket}
        cardDeleteImpact={b.cardDeleteImpact}
        cardDeleting={b.cardDeleting}
        onConfirm={b.confirmCardDelete}
        onCancel={() => b.setCardDeleteId(null)}
      />

      {/* Bulk delete confirmation */}
      <BulkDeleteDialog
        isOpen={b.showBulkDeleteConfirm}
        count={b.selectedTicketIds.size}
        busy={b.bulkDeleting}
        onConfirm={b.deleteSelected}
        onCancel={() => b.setShowBulkDeleteConfirm(false)}
      />

      {/* Create Issue Modal */}
      <CreateIssueModal
        isOpen={b.showCreateModal}
        onClose={() => {
          b.setShowCreateModal(false);
          b.setSelectedStatusId(null);
        }}
        projectId={b.projectId}
        defaultStatusId={b.selectedStatusId || undefined}
        onIssueCreated={b.handleIssueCreated}
      />

      {/* Ticket Detail Modal */}
      {b.selectedTicketId && (
        <TicketDetailModal
          isOpen={!!b.selectedTicketId}
          onClose={b.closeTicket}
          projectId={b.projectId}
          ticketId={b.selectedTicketId}
          onTicketUpdated={b.handleIssueCreated}
        />
      )}
    </div>
  );
}
