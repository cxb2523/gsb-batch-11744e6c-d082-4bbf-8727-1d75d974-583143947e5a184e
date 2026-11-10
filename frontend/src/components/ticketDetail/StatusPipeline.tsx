import React from 'react';
import { tokens } from '../../design-system/tokens';
import { WorkflowStatus } from '../../lib/api/settings';
import { Ticket } from '../../lib/api/tickets';
import { canMoveTo, transitionBlockReason } from '../../lib/statusFlow';

interface StatusPipelineProps {
  statuses: WorkflowStatus[];
  editStatusId: number | null;
  ticket: Ticket;
  isAdmin: boolean;
  isMember: boolean;
  saving: boolean;
  handleStatusChange: (statusId: number) => void;
}

/** Workflow statuses shown as a one-click pipeline (current step highlighted). */
export function StatusPipeline({ statuses, editStatusId, ticket, isAdmin, isMember, saving, handleStatusChange }: StatusPipelineProps) {
  return (
    <>
                <div
                  role="group"
                  aria-label="Status"
                  style={{
                    display: 'flex',
                    gap: 4,
                    marginBottom: 28,
                    overflowX: 'auto',
                    // Sticks to the top of the scrolling column, so status stays one
                    // click away however far down the issue you are.
                    position: 'sticky',
                    top: -32,
                    zIndex: 5,
                    background: '#FFFFFF',
                    padding: '10px 0',
                    borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
                  }}
                >
                  {statuses.map((status) => {
                    const isCurrent = status.id === editStatusId;
                    const accent = status.color || tokens.colors.neutral[400];
                    const canChange = isAdmin || isMember;
                    // Only the next step forward (and any step back / Blocked) is allowed.
                    const allowed =
                      isCurrent ||
                      canMoveTo(statuses, editStatusId, status.id, ticket.pre_block_status_id);
                    const blockReason = allowed
                      ? undefined
                      : transitionBlockReason(statuses, editStatusId, status.id, ticket.pre_block_status_id) || undefined;
                    const interactive = canChange && !isCurrent && allowed;
                    return (
                      <button
                        key={status.id}
                        onClick={() => interactive && handleStatusChange(status.id)}
                        disabled={!canChange || saving || (!allowed && !isCurrent)}
                        aria-pressed={isCurrent}
                        title={blockReason}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          whiteSpace: 'nowrap',
                          padding: '6px 11px',
                          borderRadius: 6,
                          fontSize: 12.5,
                          fontWeight: isCurrent ? 600 : 450,
                          fontFamily: 'inherit',
                          cursor: interactive ? 'pointer' : (isCurrent || allowed ? 'default' : 'not-allowed'),
                          border: `1px solid ${isCurrent ? accent : tokens.colors.neutral[200]}`,
                          background: isCurrent ? `${accent}1A` : 'transparent',
                          color: isCurrent
                            ? tokens.colors.neutral[900]
                            : allowed ? tokens.colors.neutral[600] : tokens.colors.neutral[400],
                          opacity: isCurrent || allowed ? 1 : 0.6,
                          transition: 'background-color 0.12s, border-color 0.12s',
                        }}
                        onMouseEnter={(e) => {
                          if (interactive) e.currentTarget.style.background = tokens.colors.neutral[100];
                        }}
                        onMouseLeave={(e) => {
                          if (!isCurrent) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: isCurrent ? accent : (allowed ? tokens.colors.neutral[300] : tokens.colors.neutral[200]),
                            flexShrink: 0,
                          }}
                        />
                        {status.name}
                      </button>
                    );
                  })}
                </div>
                {/* Quiet hint so the greyed-out steps aren't a mystery. */}
                <div
                  style={{
                    marginTop: -20,
                    marginBottom: 24,
                    fontSize: 11.5,
                    color: tokens.colors.neutral[500],
                  }}
                >
                  Tickets move one step at a time — you can always move back.
                </div>
    </>
  );
}
