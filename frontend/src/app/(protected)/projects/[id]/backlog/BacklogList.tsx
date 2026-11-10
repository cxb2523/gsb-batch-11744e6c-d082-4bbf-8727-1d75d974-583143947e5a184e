import React from 'react';
import { ChevronDown, ChevronRight, Target, GripVertical, Check } from 'lucide-react';
import { EpicListItem } from '../../../../../lib/api/epics';
import { BacklogTicket } from './types';
import { COLORS } from './constants';
import { getTypeBadge, getPriorityBadge } from './badges';

interface BacklogListProps {
  total: number;
  epicsOpen: boolean;
  setEpicsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  epicsList: EpicListItem[];
  onSelectTicket: (id: number) => void;
  ticketsOpen: boolean;
  setTicketsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tickets: BacklogTicket[];
  searchQuery: string;
  loading: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (ticketId: number, e: React.MouseEvent) => void;
  onDragStart: (ticket: BacklogTicket) => void;
  onDragEnd: () => void;
  editingStoryPoints: number | null;
  setEditingStoryPoints: (id: number | null) => void;
  onStoryPointsUpdate: (ticketId: number, storyPoints: number | null) => void;
  goToPrevPage: () => void;
  goToNextPage: () => void;
  pageIndex: number;
  nextCursor: string | null;
  totalPages: number;
}

export function BacklogList({
  total,
  epicsOpen,
  setEpicsOpen,
  epicsList,
  onSelectTicket,
  ticketsOpen,
  setTicketsOpen,
  tickets,
  searchQuery,
  loading,
  selectedIds,
  onToggleSelect,
  onDragStart,
  onDragEnd,
  editingStoryPoints,
  setEditingStoryPoints,
  onStoryPointsUpdate,
  goToPrevPage,
  goToNextPage,
  pageIndex,
  nextCursor,
  totalPages,
}: BacklogListProps) {
  return (
    <div style={{ flex: '0 0 60%', overflow: 'auto', padding: 16, borderRight: `2px solid ${COLORS.border}` }}>
      <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Backlog ({total} issues)
      </div>

      {/* ===== Epics section — a parent for the project's epics, mirroring
              the Tickets section below. ===== */}
      <div style={{ marginBottom: 16 }}>
        <div
          onClick={() => setEpicsOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            background: '#F3F0FF', borderRadius: 3, cursor: 'pointer',
            marginBottom: epicsOpen ? 8 : 0, transition: 'background 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#EAE6FF'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#F3F0FF'; }}
        >
          {epicsOpen ? <ChevronDown size={16} color={COLORS.textSecondary} /> : <ChevronRight size={16} color={COLORS.textSecondary} />}
          <Target size={14} color="#6554C0" />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>Epics</div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{epicsList.length} epics</div>
        </div>

        {epicsOpen && (
          epicsList.length === 0 ? (
            <div style={{ padding: 12, fontSize: 13, color: COLORS.textTertiary, fontStyle: 'italic' }}>
              No epics in this project yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {epicsList.map((epic) => (
                <div
                  key={`epic-row-${epic.id}`}
                  onClick={() => onSelectTicket(epic.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    background: COLORS.cardBg, border: `1px solid ${COLORS.border}`,
                    borderRadius: 3, cursor: 'pointer', transition: 'all 150ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.hoverBg; e.currentTarget.style.borderColor = COLORS.primary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.cardBg; e.currentTarget.style.borderColor = COLORS.border; }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: epic.color || '#6554C0', flexShrink: 0 }} />
                  <div style={{ width: 72, flexShrink: 0, fontSize: 12, fontWeight: 600, color: COLORS.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{epic.key}</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{epic.title}</div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, flexShrink: 0 }}>{epic.completed_tickets}/{epic.total_tickets} done</div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ===== Tickets section — every backlog ticket, with or without an
              epic. Paged with Previous / Next. ===== */}
      <div style={{ marginBottom: 16 }}>
        <div
          onClick={() => setTicketsOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            background: COLORS.hoverBg, borderRadius: 3, cursor: 'pointer',
            marginBottom: ticketsOpen ? 8 : 0, transition: 'background 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#DFE1E6'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.hoverBg; }}
        >
          {ticketsOpen ? <ChevronDown size={16} color={COLORS.textSecondary} /> : <ChevronRight size={16} color={COLORS.textSecondary} />}
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>Tickets</div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{total} issues</div>
        </div>

        {ticketsOpen && (
          tickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: COLORS.textSecondary, fontSize: 14 }}>
              {searchQuery ? 'No issues match your search' : 'No issues in backlog'}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
                {tickets.map((ticket) => {
                  const isSelected = selectedIds.has(ticket.id);
                  return (
                    <div
                      key={ticket.id}
                      draggable
                      onDragStart={() => onDragStart(ticket)}
                      onDragEnd={onDragEnd}
                      onClick={(e) => {
                        if (isSelected || e.shiftKey) {
                          onToggleSelect(ticket.id, e);
                          return;
                        }
                        onSelectTicket(ticket.id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        background: isSelected ? COLORS.activeBg : COLORS.cardBg,
                        border: `1px solid ${isSelected ? COLORS.primary : COLORS.border}`,
                        borderRadius: 3,
                        cursor: 'pointer',
                        transition: 'all 150ms',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = COLORS.hoverBg;
                          e.currentTarget.style.borderColor = COLORS.primary;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = COLORS.cardBg;
                          e.currentTarget.style.borderColor = COLORS.border;
                        }
                      }}
                    >
                      {/* Selection checkbox */}
                      <button
                        onClick={(e) => onToggleSelect(ticket.id, e)}
                        style={{
                          background: isSelected ? COLORS.primary : '#FFFFFF',
                          border: `1px solid ${isSelected ? COLORS.primary : COLORS.border}`,
                          borderRadius: 3,
                          width: 16,
                          height: 16,
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFFFFF',
                          flexShrink: 0,
                        }}
                        title={isSelected ? 'Deselect' : 'Select'}
                      >
                        {isSelected ? <Check size={11} /> : null}
                      </button>
                      <GripVertical size={14} color={COLORS.textTertiary} style={{ cursor: 'grab', flexShrink: 0 }} />
                      <div style={{ width: 72, flexShrink: 0, fontSize: 12, fontWeight: 600, color: COLORS.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.key}</div>
                      <div style={{ width: 80, flexShrink: 0 }}>{getTypeBadge(ticket.type)}</div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ticket.title}
                      </div>
                      {/* Priority — fixed slot, left blank (not collapsed) when none, so columns align */}
                      <div style={{ width: 64, flexShrink: 0, display: 'flex' }}>
                        {ticket.priority ? getPriorityBadge(ticket.priority) : null}
                      </div>

                      {/* Story Points (Editable) — fixed slot so points align */}
                      <div style={{ width: 64, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                        {editingStoryPoints === ticket.id ? (
                          <input
                            type="number"
                            autoFocus
                            placeholder="pts"
                            defaultValue={ticket.story_points || ''}
                            onBlur={(e) => {
                              const value = e.target.value ? parseInt(e.target.value) : null;
                              onStoryPointsUpdate(ticket.id, value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const value = e.currentTarget.value ? parseInt(e.currentTarget.value) : null;
                                onStoryPointsUpdate(ticket.id, value);
                              } else if (e.key === 'Escape') {
                                setEditingStoryPoints(null);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: '100%',
                              height: 26,
                              padding: '2px 8px',
                              border: `2px solid ${COLORS.primary}`,
                              borderRadius: 4,
                              fontSize: 13,
                              textAlign: 'center',
                              outline: 'none',
                            }}
                          />
                        ) : (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingStoryPoints(ticket.id);
                            }}
                            title="Story points — click to edit"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '100%',
                              height: 22,
                              padding: '0 8px',
                              borderRadius: 11,
                              fontSize: 11,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              cursor: 'pointer',
                              // A filled points chip when set; a dashed "add points"
                              // affordance when empty, so it's clearly about points.
                              background: ticket.story_points ? '#EAE6FF' : 'transparent',
                              color: ticket.story_points ? '#6554C0' : COLORS.textTertiary,
                              border: ticket.story_points ? '1px solid #DFD8FD' : `1px dashed ${COLORS.border}`,
                            }}
                          >
                            {ticket.story_points ? `${ticket.story_points} pts` : '+ pts'}
                          </div>
                        )}
                      </div>

                      {/* Assignee — fixed slot, blank (not collapsed) when none */}
                      <div style={{ width: 24, flexShrink: 0 }}>
                        {ticket.assignee && (
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: COLORS.primary,
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 10,
                              fontWeight: 600,
                            }}
                            title={ticket.assignee.name}
                          >
                            {ticket.assignee.initials}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Previous / Next pagination */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
                <button
                  onClick={goToPrevPage}
                  disabled={pageIndex === 0 || loading}
                  style={{
                    padding: '6px 14px',
                    background: COLORS.cardBg,
                    color: (pageIndex === 0 || loading) ? COLORS.textTertiary : COLORS.primary,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 3,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: (pageIndex === 0 || loading) ? 'default' : 'pointer',
                    opacity: (pageIndex === 0 || loading) ? 0.6 : 1,
                  }}
                >
                  ← Previous
                </button>
                <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
                  {loading ? 'Loading…' : `Page ${pageIndex + 1} of ${totalPages}`}
                </div>
                <button
                  onClick={goToNextPage}
                  disabled={!nextCursor || loading}
                  style={{
                    padding: '6px 14px',
                    background: COLORS.cardBg,
                    color: (!nextCursor || loading) ? COLORS.textTertiary : COLORS.primary,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 3,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: (!nextCursor || loading) ? 'default' : 'pointer',
                    opacity: (!nextCursor || loading) ? 0.6 : 1,
                  }}
                >
                  Next →
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
