import React from 'react';
import { AlertCircle } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { Avatar } from '../../design-system/components';
import { Select } from '../ui';
import { todayLocal } from '../../lib/date';
import { ProjectMember, Label } from '../../lib/api/settings';
import { EpicListItem } from '../../lib/api/epics';
import { Sprint } from '../../lib/api/sprints';
import { Ticket, TicketUpdateData } from '../../lib/api/tickets';
import { DetailRow } from './DetailRow';
import { LabelPicker } from './LabelPicker';
import { normalizeUrl, isValidHttpUrl, readValueStyle, readEmptyStyle } from './utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface DetailsRailProps {
  ticket: Ticket;
  projectId: number;
  ticketId: number;
  isAdmin: boolean;
  isMember: boolean;
  user: { id: number } | null;
  members: ProjectMember[];
  labels: Label[];
  epics: EpicListItem[];
  sprints: Sprint[];
  editAssigneeId: number | null;
  setEditAssigneeId: React.Dispatch<React.SetStateAction<number | null>>;
  editLabelIds: number[];
  setEditLabelIds: React.Dispatch<React.SetStateAction<number[]>>;
  editEpicId: number | null;
  setEditEpicId: React.Dispatch<React.SetStateAction<number | null>>;
  editSprintId: number | null;
  setEditSprintId: React.Dispatch<React.SetStateAction<number | null>>;
  editDueDate: string;
  setEditDueDate: React.Dispatch<React.SetStateAction<string>>;
  editMergeRequestUrl: string;
  setEditMergeRequestUrl: React.Dispatch<React.SetStateAction<string>>;
  mrError: string | null;
  setMrError: React.Dispatch<React.SetStateAction<string | null>>;
  loadTicketData: (options?: { silent?: boolean }) => void;
  saveFieldDirectly: (updates: TicketUpdateData) => void;
}

/** Right-column metadata rail: assignee, labels, epic, sprint, due date and the
 *  merge-request field, each editable in place. */
export function DetailsRail({
  ticket, projectId, ticketId, isAdmin, isMember, user,
  members, labels, epics, sprints,
  editAssigneeId, setEditAssigneeId, editLabelIds, setEditLabelIds,
  editEpicId, setEditEpicId, editSprintId, setEditSprintId,
  editDueDate, setEditDueDate, editMergeRequestUrl, setEditMergeRequestUrl,
  mrError, setMrError, loadTicketData, saveFieldDirectly,
}: DetailsRailProps) {
  return (
              <div
                style={{
                  flex: '0 0 35%',
                  overflowY: 'auto',
                  padding: '32px 24px',
                  backgroundColor: tokens.colors.neutral[50],
                }}
              >
                {/* Header: title on the left, an explicit Edit / Save·Cancel affordance
                    on the right so it's obvious the rail is editable (and when it isn't). */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    margin: '0 0 20px',
                    minHeight: 28,
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 11,
                      fontWeight: 700,
                      color: tokens.colors.neutral[600],
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                    }}
                  >
                    Details
                  </h4>

                </div>

                {/* One compact row per field — always editable for members/admins via
                    ghost-quiet controls that reveal on hover; read-only span for viewers. */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <DetailRow label="Assignee">
                    {(isAdmin || isMember) ? (
                      <Select<number>
                        value={editAssigneeId}
                        onChange={(next) => {
                          setEditAssigneeId(next);
                          const member = next ? members.find((m) => m.user_id === next) : null;
                          saveFieldDirectly({ assignee_email: member?.email ?? null });
                        }}
                        options={members.map((member) => ({
                          value: member.user_id,
                          label: member.name || member.email,
                        }))}
                        clearable
                        clearLabel="Unassigned"
                        placeholder="Unassigned"
                        emptyLabel="Unassigned"
                        ariaLabel="Assignee"
                        size="sm"
                        variant="ghost"
                        minMenuWidth={260}
                        renderTrigger={(option) =>
                          option ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <Avatar name={option.label} size={20} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {option.label}
                              </span>
                            </span>
                          ) : (
                            <span style={{ color: tokens.colors.neutral[500] }}>Unassigned</span>
                          )
                        }
                      />
                    ) : ticket.assignee ? (
                      <span style={readValueStyle}>
                        <Avatar name={ticket.assignee.name} size={20} />
                        {ticket.assignee.name}
                      </span>
                    ) : (
                      <span style={readEmptyStyle}>Unassigned</span>
                    )}
                  </DetailRow>

                  <DetailRow label="Epic">
                    {(isAdmin || isMember) ? (
                      <Select<number>
                        value={editEpicId}
                        onChange={(next) => {
                          setEditEpicId(next);
                          saveFieldDirectly({ epic_id: next });
                        }}
                        options={epics.map((epic) => ({ value: epic.id, label: epic.title }))}
                        clearable
                        clearLabel="No epic"
                        placeholder="No epic"
                        emptyLabel="No epic"
                        ariaLabel="Epic"
                        size="sm"
                        variant="ghost"
                        minMenuWidth={260}
                      />
                    ) : (
                      <span style={ticket.epic_id ? readValueStyle : readEmptyStyle}>
                        {epics.find((e) => e.id === ticket.epic_id)?.title || 'No epic'}
                      </span>
                    )}
                  </DetailRow>

                  <DetailRow label="Sprint">
                    {(isAdmin || isMember) ? (
                      <Select<number>
                        value={editSprintId}
                        onChange={(next) => {
                          setEditSprintId(next);
                          saveFieldDirectly({ sprint_id: next });
                        }}
                        options={sprints.map((sprint) => ({ value: sprint.id, label: sprint.name }))}
                        clearable
                        clearLabel="No sprint"
                        placeholder="No sprint"
                        emptyLabel="No sprint"
                        ariaLabel="Sprint"
                        size="sm"
                        variant="ghost"
                        minMenuWidth={260}
                      />
                    ) : (
                      <span style={ticket.sprint_id ? readValueStyle : readEmptyStyle}>
                        {sprints.find((s) => s.id === ticket.sprint_id)?.name || 'No sprint'}
                      </span>
                    )}
                  </DetailRow>

                  <DetailRow label="Labels" align="flex-start">
                    {(isAdmin || isMember) ? (
                      <LabelPicker
                        labels={labels}
                        selectedIds={editLabelIds}
                        onChange={(next) => {
                          setEditLabelIds(next);
                          const labelNames = next
                            .map((id) => labels.find((l) => l.id === id)?.name)
                            .filter((n): n is string => n !== undefined);
                          saveFieldDirectly({ labels: labelNames });
                        }}
                      />
                    ) : (ticket.labels || []).length > 0 ? (
                      <span style={{ ...readValueStyle, flexWrap: 'wrap', gap: 4 }}>
                        {(ticket.labels || []).map((name) => (
                          <span
                            key={name}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 10,
                              background: labels.find((l) => l.name === name)?.color || tokens.colors.neutral[200],
                              color: tokens.colors.neutral[900],
                            }}
                          >
                            {name}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span style={readEmptyStyle}>No labels</span>
                    )}
                  </DetailRow>

                  {/* A due date can be ADDED when the ticket has none, but once set it
                      is locked — the product treats an existing due date as fixed. */}
                  <DetailRow label="Due date">
                    {(isAdmin || isMember) && !ticket.due_date ? (
                      <input
                        type="date"
                        value={editDueDate ? editDueDate.slice(0, 10) : ''}
                        min={todayLocal()}
                        aria-label="Due date"
                        onChange={(event) =>
                          setEditDueDate(
                            event.target.value ? `${event.target.value}T00:00:00Z` : '',
                          )
                        }
                        onBlur={() => {
                          if (editDueDate) saveFieldDirectly({ due_date: editDueDate });
                        }}
                        style={{
                          width: '100%',
                          height: 30,
                          padding: '0 8px',
                          border: `1px solid ${tokens.colors.neutral[300]}`,
                          borderRadius: 4,
                          fontSize: 13,
                          fontFamily: 'inherit',
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <span style={ticket.due_date ? readValueStyle : readEmptyStyle}>
                        {ticket.due_date
                          ? new Date(ticket.due_date).toLocaleDateString(undefined, {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'No due date'}
                      </span>
                    )}
                  </DetailRow>

                  <DetailRow label="Reporter">
                    <span style={readValueStyle}>
                      <Avatar name={ticket.reporter?.name || 'Unknown'} size={20} />
                      {ticket.reporter?.name || 'Unknown'}
                    </span>
                  </DetailRow>

                  <DetailRow label="Merge request" align="flex-start">
                    {(isAdmin || isMember) ? (
                      <div style={{ width: '100%' }}>
                        <input
                          value={editMergeRequestUrl}
                          placeholder="https://gitlab.com/…"
                          onChange={(event) => {
                            setEditMergeRequestUrl(event.target.value);
                            if (mrError) setMrError(null);
                          }}
                          onBlur={() => {
                            const mr = editMergeRequestUrl.trim();
                            if (mr && !isValidHttpUrl(mr)) {
                              setMrError('Enter a valid link, e.g. https://gitlab.com/group/repo/-/merge_requests/42');
                              return;
                            }
                            setMrError(null);
                            if (mr !== (ticket.merge_request_url || '')) {
                              saveFieldDirectly({
                                merge_request_url: mr ? normalizeUrl(mr) : undefined,
                              });
                            }
                          }}
                          className="td-ghost"
                          style={{
                            width: '100%',
                            height: 30,
                            padding: '0 8px',
                            borderRadius: 4,
                            fontSize: 13,
                            fontFamily: 'inherit',
                            outline: 'none',
                            color: editMergeRequestUrl ? tokens.colors.primary[600] : tokens.colors.neutral[500],
                          }}
                        />
                        {mrError && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 4,
                              marginTop: 4,
                              fontSize: 11,
                              color: tokens.colors.error[600],
                            }}
                          >
                            <AlertCircle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
                            <span>{mrError}</span>
                          </div>
                        )}
                      </div>
                    ) : ticket.merge_request_url ? (
                      <a
                        href={normalizeUrl(ticket.merge_request_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={ticket.merge_request_url}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '6px 8px',
                          fontSize: 13,
                          color: tokens.colors.primary[600],
                          textDecoration: 'none',
                          wordBreak: 'break-all',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ticket.merge_request_url}
                        </span>
                      </a>
                    ) : (
                      <span style={readEmptyStyle}>No link</span>
                    )}
                  </DetailRow>
                </div>

                {/* HIDDEN (open-source launch): divider + Time Tracking section (heading, Log Work button, TimeTrackingBar) */}

                {/* HIDDEN (open-source launch): Worklogs collapsible list in right panel
                {worklogs.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <details open={showWorklogsExpanded} onToggle={...}>
                      ... worklog entries ...
                    </details>
                  </div>
                )}
                */}

                {/* Divider */}
                <div
                  style={{
                    height: 1,
                    backgroundColor: tokens.colors.neutral[200],
                    margin: '24px 0',
                  }}
                />

                {/* Watchers */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: tokens.colors.neutral[600], marginBottom: 8 }}>
                    WATCHERS
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {ticket.watchers?.map((watcher: any) => (
                      <div
                        key={watcher.user_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 8px',
                          backgroundColor: tokens.colors.neutral[100],
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            backgroundColor: tokens.colors.primary[500],
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        >
                          {watcher.initials}
                        </div>
                        <span>{watcher.name}</span>
                      </div>
                    )) || []}
                  </div>
                  {(isAdmin || isMember) && (
                    <button
                      onClick={async () => {
                        try {
                          const isWatching = ticket.watchers?.some((w: any) => w.user_id === user?.id);
                          const endpoint = isWatching
                            ? `${API_URL}/projects/${projectId}/issues/${ticketId}/watch`
                            : `${API_URL}/projects/${projectId}/issues/${ticketId}/watch`;

                          const response = await fetch(endpoint, {
                            method: isWatching ? 'DELETE' : 'POST',
                            credentials: 'include',
                          });

                          if (response.ok) {
                            // Refresh ticket data
                            loadTicketData({ silent: true });
                          }
                        } catch (error) {
                          console.error('Error updating watchers:', error);
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        color: tokens.colors.primary[600],
                        backgroundColor: 'white',
                        border: `1px solid ${tokens.colors.neutral[300]}`,
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {ticket.watchers?.some((w: any) => w.user_id === user?.id) ? 'Stop watching' : 'Start watching'}
                    </button>
                  )}
                </div>

                {/* Dates Section */}
                <h4
                  style={{
                    margin: '32px 0 20px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: tokens.colors.neutral[600],
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                  }}
                >
                  Dates
                </h4>

                {/* Created */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: tokens.colors.neutral[600], marginBottom: 6 }}>
                    CREATED
                  </label>
                  <div style={{ fontSize: 13, color: tokens.colors.neutral[700] }}>
                    {new Date(ticket.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                </div>

                {/* Updated */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: tokens.colors.neutral[600], marginBottom: 6 }}>
                    UPDATED
                  </label>
                  <div style={{ fontSize: 13, color: tokens.colors.neutral[700] }}>
                    {ticket.updated_at ? new Date(ticket.updated_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }) : 'N/A'}
                  </div>
                </div>

                {/* Resolved - only show if ticket is in Done status */}
                {ticket.status_name?.toLowerCase().includes('done') && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: tokens.colors.neutral[600], marginBottom: 6 }}>
                      RESOLVED
                    </label>
                    <div style={{ fontSize: 13, color: tokens.colors.success[600] }}>
                      {ticket.updated_at ? new Date(ticket.updated_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }) : 'N/A'}
                    </div>
                  </div>
                )}
              </div>
  );
}
