import React from 'react';
import { ChevronDown, ChevronRight, Calendar, Users, Target, Plus } from 'lucide-react';
import { BacklogTicket, SprintWithCapacity } from './types';
import { Sprint } from '../../../../../lib/api/sprints';
import { COLORS } from './constants';
import { getTypeBadge, getPriorityBadge } from './badges';

interface SprintPanelProps {
  futureSprints: SprintWithCapacity[];
  activeSprints: SprintWithCapacity[];
  closedSprints: SprintWithCapacity[];
  expandedSprints: Set<number>;
  dragOverSprint: number | null;
  onDragOver: (e: React.DragEvent, sprintId: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, sprintId: number) => void;
  toggleSprint: (sprintId: number) => void;
  sprintTickets: Map<number, BacklogTicket[]>;
  onSelectTicket: (id: number) => void;
  onStartSprint: (sprint: Sprint) => void;
  onCompleteSprint: (sprintId: number) => void;
  onCreateSprint: () => void;
}

// A single ticket row inside a sprint card — identical markup for future,
// active, and closed sprints.
function SprintTicketRow({ ticket, onSelectTicket }: { ticket: BacklogTicket; onSelectTicket: (id: number) => void }) {
  return (
    <div
      onClick={() => onSelectTicket(ticket.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 3,
        cursor: 'pointer',
        transition: 'all 150ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = COLORS.hoverBg;
        e.currentTarget.style.borderColor = COLORS.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = COLORS.cardBg;
        e.currentTarget.style.borderColor = COLORS.border;
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.primary, minWidth: 80 }}>{ticket.key}</div>
      {getTypeBadge(ticket.type)}
      <div style={{ flex: 1, fontSize: 14, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ticket.title}
      </div>
      {ticket.priority && getPriorityBadge(ticket.priority)}
      {ticket.story_points !== null && ticket.story_points !== undefined && (
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#6554C0',
          background: '#EAE6FF',
          padding: '2px 6px',
          borderRadius: 3,
          minWidth: 30,
          textAlign: 'center',
        }}>
          {ticket.story_points}
        </div>
      )}
    </div>
  );
}

export function SprintPanel({
  futureSprints,
  activeSprints,
  closedSprints,
  expandedSprints,
  dragOverSprint,
  onDragOver,
  onDragLeave,
  onDrop,
  toggleSprint,
  sprintTickets,
  onSelectTicket,
  onStartSprint,
  onCompleteSprint,
  onCreateSprint,
}: SprintPanelProps) {
  return (
    <div style={{ flex: '0 0 40%', overflow: 'auto', padding: 16, background: '#FAFBFC' }}>
      <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Sprints
      </div>

      {/* Future Sprints */}
      {futureSprints.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Future Sprints
          </div>
          {futureSprints.map((sprint) => {
            const isExpanded = expandedSprints.has(sprint.id);
            const isDragOver = dragOverSprint === sprint.id;

            return (
              <div
                key={sprint.id}
                onDragOver={(e) => onDragOver(e, sprint.id)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, sprint.id)}
                style={{
                  marginBottom: 8,
                  background: isDragOver ? COLORS.activeBg : COLORS.cardBg,
                  border: `2px solid ${isDragOver ? COLORS.primary : COLORS.border}`,
                  borderRadius: 3,
                  overflow: 'hidden',
                  transition: 'all 150ms',
                }}
              >
                <div
                  onClick={() => toggleSprint(sprint.id)}
                  style={{
                    padding: 12,
                    cursor: 'pointer',
                    borderBottom: isExpanded ? `1px solid ${COLORS.border}` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {isExpanded ? <ChevronDown size={14} color={COLORS.textSecondary} /> : <ChevronRight size={14} color={COLORS.textSecondary} />}
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{sprint.name}</div>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#5243AA',
                      background: '#EAE6FF',
                      padding: '2px 6px',
                      borderRadius: 3,
                      textTransform: 'uppercase',
                    }}>
                      Planned
                    </div>
                  </div>
                  {sprint.goal && (
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>{sprint.goal}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: COLORS.textSecondary }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Target size={12} />
                      {sprint.capacity?.total_story_points || 0} pts
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Users size={12} />
                      {sprint.capacity?.total_issues || 0} issues
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: 12, background: '#FAFBFC' }}>
                    {/* Sprint Tickets */}
                    {sprintTickets.get(sprint.id) && sprintTickets.get(sprint.id)!.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                        {sprintTickets.get(sprint.id)!.map((ticket) => (
                          <SprintTicketRow key={ticket.id} ticket={ticket} onSelectTicket={onSelectTicket} />
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => onStartSprint(sprint)}
                      style={{
                        width: '100%',
                        padding: '6px 12px',
                        background: COLORS.primary,
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 3,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'background 150ms',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#0747A6'}
                      onMouseLeave={(e) => e.currentTarget.style.background = COLORS.primary}
                    >
                      Start Sprint
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Active Sprints */}
      {activeSprints.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {activeSprints.length > 1 ? 'Active Sprints' : 'Active Sprint'}
          </div>
          {activeSprints.map((activeSprint) => (
          <div
            key={activeSprint.id}
            onDragOver={(e) => onDragOver(e, activeSprint.id)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, activeSprint.id)}
            style={{
              background: dragOverSprint === activeSprint.id ? COLORS.activeBg : COLORS.cardBg,
              border: `2px solid ${dragOverSprint === activeSprint.id ? COLORS.primary : '#36B37E'}`,
              borderRadius: 3,
              overflow: 'hidden',
              transition: 'all 150ms',
              marginBottom: 8,
            }}
          >
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{activeSprint.name}</div>
                <div style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: '#36B37E',
                  padding: '2px 6px',
                  borderRadius: 3,
                  textTransform: 'uppercase',
                }}>
                  Active
                </div>
              </div>
              {activeSprint.goal && (
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>{activeSprint.goal}</div>
              )}

              {/* Progress Bar */}
              {activeSprint.capacity && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>
                    <span>{activeSprint.capacity.completed_story_points} / {activeSprint.capacity.total_story_points} pts</span>
                    <span>{activeSprint.capacity.progress_percentage}%</span>
                  </div>
                  <div style={{ height: 6, background: COLORS.border, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${activeSprint.capacity.progress_percentage}%`,
                      background: '#36B37E',
                      transition: 'width 300ms',
                    }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={12} />
                  {activeSprint.capacity?.total_issues || 0} issues
                </div>
                {activeSprint.capacity?.days_remaining !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} />
                    {activeSprint.capacity.days_remaining} days left
                  </div>
                )}
              </div>

              {/* Active Sprint Tickets */}
              {sprintTickets.get(activeSprint.id) && sprintTickets.get(activeSprint.id)!.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                  {sprintTickets.get(activeSprint.id)!.map((ticket) => (
                    <SprintTicketRow key={ticket.id} ticket={ticket} onSelectTicket={onSelectTicket} />
                  ))}
                </div>
              )}

              <button
                onClick={() => onCompleteSprint(activeSprint.id)}
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  background: COLORS.cardBg,
                  color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 3,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLORS.hoverBg;
                  e.currentTarget.style.borderColor = COLORS.textSecondary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = COLORS.cardBg;
                  e.currentTarget.style.borderColor = COLORS.border;
                }}
              >
                Complete Sprint
              </button>
            </div>
          </div>
          ))}
        </div>
      )}

      {/* Create Sprint Button */}
      <button
        onClick={onCreateSprint}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: COLORS.cardBg,
          color: COLORS.primary,
          border: `2px dashed ${COLORS.border}`,
          borderRadius: 3,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'all 150ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = COLORS.primary;
          e.currentTarget.style.background = COLORS.activeBg;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = COLORS.border;
          e.currentTarget.style.background = COLORS.cardBg;
        }}
      >
        <Plus size={16} />
        Create Sprint
      </button>

      {/* Closed Sprints */}
      {closedSprints.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Closed Sprints ({closedSprints.length})
          </div>
          {closedSprints.map((sprint) => {
            const isExpanded = expandedSprints.has(sprint.id);

            return (
              <div
                key={sprint.id}
                style={{
                  marginBottom: 8,
                  background: COLORS.cardBg,
                  border: `2px solid ${COLORS.border}`,
                  borderRadius: 3,
                  overflow: 'hidden',
                  opacity: 0.7,
                }}
              >
                <div
                  onClick={() => toggleSprint(sprint.id)}
                  style={{
                    padding: 12,
                    cursor: 'pointer',
                    borderBottom: isExpanded ? `1px solid ${COLORS.border}` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {isExpanded ? <ChevronDown size={14} color={COLORS.textSecondary} /> : <ChevronRight size={14} color={COLORS.textSecondary} />}
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{sprint.name}</div>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#5E6C84',
                      background: '#F4F5F7',
                      padding: '2px 6px',
                      borderRadius: 3,
                      textTransform: 'uppercase',
                    }}>
                      Closed
                    </div>
                  </div>
                  {sprint.goal && (
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>{sprint.goal}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: COLORS.textSecondary }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Target size={12} />
                      {sprint.capacity?.completed_story_points || 0} / {sprint.capacity?.total_story_points || 0} pts completed
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Users size={12} />
                      {sprint.capacity?.total_issues || 0} issues
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: 12, background: '#FAFBFC' }}>
                    {/* Sprint Tickets */}
                    {sprintTickets.get(sprint.id) && sprintTickets.get(sprint.id)!.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {sprintTickets.get(sprint.id)!.map((ticket) => (
                          <SprintTicketRow key={ticket.id} ticket={ticket} onSelectTicket={onSelectTicket} />
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: 16, fontSize: 12, color: COLORS.textSecondary }}>
                        No issues in this sprint
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
