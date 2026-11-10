import React from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Eye, ChevronDown, Check, Archive, ArchiveRestore, Trash2, MoreHorizontal, Link as LinkIcon } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { ButtonCore, useToast } from '../ui';
import IssueHierarchyBreadcrumb from '../issue/IssueHierarchyBreadcrumb';
import { PRIORITIES, priorityColor, priorityLabel, type Priority } from '../../lib/priority';
import { canMoveTo, transitionBlockReason } from '../../lib/statusFlow';
import { Ticket } from '../../lib/api/tickets';
import { WorkflowStatus } from '../../lib/api/settings';
import { EpicListItem } from '../../lib/api/epics';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type MenuPos = { top: number; left: number } | null;

interface StickyHeaderProps {
  ticket: Ticket;
  projectId: number;
  ticketId: number;
  onClose: () => void;
  isAdmin: boolean;
  isMember: boolean;
  user: { id: number } | null;
  saving: boolean;
  statuses: WorkflowStatus[];
  epics: EpicListItem[];
  editStatusId: number | null;
  editPriority: Priority | undefined;
  parentTicket: Ticket | null;
  currentStatusColor: string;
  canDelete: boolean;
  hasChanges: () => boolean;
  showStatusDropdown: boolean;
  setShowStatusDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  showPriorityDropdown: boolean;
  setShowPriorityDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  showMoreMenu: boolean;
  setShowMoreMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAssigneeDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLabelsDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  setShowEpicDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSprintDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCloneModal: React.Dispatch<React.SetStateAction<boolean>>;
  statusMenuPos: MenuPos;
  setStatusMenuPos: React.Dispatch<React.SetStateAction<MenuPos>>;
  priorityMenuPos: MenuPos;
  setPriorityMenuPos: React.Dispatch<React.SetStateAction<MenuPos>>;
  statusButtonRef: React.RefObject<HTMLButtonElement | null>;
  statusDropdownRef: React.RefObject<HTMLDivElement | null>;
  statusMenuRef: React.RefObject<HTMLDivElement | null>;
  priorityButtonRef: React.RefObject<HTMLButtonElement | null>;
  priorityDropdownRef: React.RefObject<HTMLDivElement | null>;
  priorityMenuRef: React.RefObject<HTMLDivElement | null>;
  moreMenuRef: React.RefObject<HTMLDivElement | null>;
  handleStatusChange: (newStatusId: number) => void;
  handlePriorityChange: (newPriority: Priority) => void;
  handleSave: () => void;
  handleToggleArchive: () => void;
  openDeleteConfirm: () => void;
  handleNavigateToIssue: (issueId: number) => void;
  loadTicketData: (options?: { silent?: boolean }) => void;
}

/** The modal's sticky header: issue key/type/breadcrumb, inline status and
 *  priority pickers, and the actions row (copy, watch, more-menu, save, close). */
export function StickyHeader({
  ticket, projectId, ticketId, onClose, isAdmin, isMember, user, saving,
  statuses, epics, editStatusId, editPriority, parentTicket, currentStatusColor,
  canDelete, hasChanges,
  showStatusDropdown, setShowStatusDropdown, showPriorityDropdown, setShowPriorityDropdown,
  showMoreMenu, setShowMoreMenu, setShowAssigneeDropdown, setShowLabelsDropdown,
  setShowEpicDropdown, setShowSprintDropdown, setShowCloneModal,
  statusMenuPos, setStatusMenuPos, priorityMenuPos, setPriorityMenuPos,
  statusButtonRef, statusDropdownRef, statusMenuRef,
  priorityButtonRef, priorityDropdownRef, priorityMenuRef, moreMenuRef,
  handleStatusChange, handlePriorityChange, handleSave, handleToggleArchive,
  openDeleteConfirm, handleNavigateToIssue, loadTicketData,
}: StickyHeaderProps) {
  const toast = useToast();
  return (
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                backgroundColor: 'white',
                borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
                flexShrink: 0,
              }}
            >
              {/* Top Header Row */}
              <div
                style={{
                  padding: '16px 32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 60,
                }}
              >
                {/* Left: Issue Key + Type + Breadcrumb */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Issue Type Badge */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 4,
                        backgroundColor: ticket.status_color ? `${ticket.status_color}20` : tokens.colors.info[100],
                        color: ticket.status_color ?? tokens.colors.info[600],
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ticket.type ?? 'task'}
                    </span>

                    {/* Issue Key */}
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: tokens.colors.neutral[700],
                      }}
                    >
                      {ticket.key}
                    </span>
                  </div>

                  {/* Breadcrumb */}
                  {(() => {
                    const breadcrumbItems: Array<{
                      id: number;
                      key: string;
                      title: string;
                      type: 'epic' | 'story' | 'task' | 'bug';
                    }> = [];

                    // Add epic if exists
                    const epic = epics.find((e) => e.id === ticket.epic_id);
                    if (epic && ticket.epic_id) {
                      breadcrumbItems.push({
                        id: ticket.epic_id,
                        key: epic.key || `EPIC-${ticket.epic_id}`,
                        title: epic.title,
                        type: 'epic' as const,
                      });
                    }

                    // Add parent if exists
                    if (parentTicket && ticket.parent_id) {
                      breadcrumbItems.push({
                        id: ticket.parent_id,
                        key: parentTicket.key,
                        title: parentTicket.title,
                        type: (parentTicket.type as 'story' | 'task' | 'bug') || 'task',
                      });
                    }

                    return breadcrumbItems.length > 0 ? (
                      <IssueHierarchyBreadcrumb
                        items={breadcrumbItems}
                        onNavigate={handleNavigateToIssue}
                      />
                    ) : null;
                  })()}

                  {/* Status Dropdown - Inline */}
                  <div style={{ position: 'relative' }} ref={statusDropdownRef}>
                    {isAdmin || isMember ? (
                      <button
                        ref={statusButtonRef}
                        onClick={() => {
                          if (!showStatusDropdown) {
                            const rect = statusButtonRef.current?.getBoundingClientRect();
                            if (rect) setStatusMenuPos({ top: rect.bottom + 4, left: rect.left });
                          }
                          setShowStatusDropdown(!showStatusDropdown);
                          setShowPriorityDropdown(false);
                          setShowAssigneeDropdown(false);
                          setShowLabelsDropdown(false);
                          setShowEpicDropdown(false);
                          setShowSprintDropdown(false);
                        }}
                        style={{
                          padding: '5px 10px 5px 9px',
                          borderRadius: 6,
                          border: `1px solid ${currentStatusColor}33`,
                          backgroundColor: `${currentStatusColor}14`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 550,
                          color: tokens.colors.neutral[900],
                          transition: 'background-color 0.12s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `${currentStatusColor}24`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = `${currentStatusColor}14`;
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: currentStatusColor,
                            flexShrink: 0,
                          }}
                        />
                        <span>{statuses.find((s) => s.id === editStatusId)?.name || ticket.status_name}</span>
                        <ChevronDown size={13} style={{ opacity: 0.5 }} />
                      </button>
                    ) : (
                      <span
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          backgroundColor: tokens.colors.neutral[100],
                          fontSize: 13,
                          fontWeight: 500,
                          color: tokens.colors.neutral[700],
                        }}
                      >
                        {ticket.status_name}
                      </span>
                    )}
                    {showStatusDropdown && statusMenuPos && createPortal(
                      <div
                        ref={statusMenuRef}
                        style={{
                          position: 'fixed',
                          top: statusMenuPos.top,
                          left: statusMenuPos.left,
                          minWidth: 180,
                          backgroundColor: 'white',
                          border: `1px solid ${tokens.colors.neutral[300]}`,
                          borderRadius: 8,
                          boxShadow: tokens.shadows.lg,
                          zIndex: 100000,
                          maxHeight: 240,
                          overflowY: 'auto',
                        }}
                      >
                        {statuses.map((status) => {
                          const isCurrentOpt = editStatusId === status.id;
                          const allowedOpt =
                            isCurrentOpt ||
                            canMoveTo(statuses, editStatusId, status.id, ticket.pre_block_status_id);
                          const reasonOpt = allowedOpt
                            ? undefined
                            : transitionBlockReason(statuses, editStatusId, status.id, ticket.pre_block_status_id) || undefined;
                          return (
                            <button
                              key={status.id}
                              onClick={() => {
                                if (allowedOpt) handleStatusChange(status.id);
                              }}
                              disabled={!allowedOpt && !isCurrentOpt}
                              title={reasonOpt}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                backgroundColor: isCurrentOpt ? tokens.colors.primary[50] : 'white',
                                border: 'none',
                                cursor: allowedOpt && !isCurrentOpt ? 'pointer' : 'not-allowed',
                                fontSize: 13,
                                textAlign: 'left',
                                color: allowedOpt ? tokens.colors.neutral[900] : tokens.colors.neutral[400],
                                opacity: allowedOpt || isCurrentOpt ? 1 : 0.7,
                              }}
                              onMouseEnter={(e) => {
                                if (!isCurrentOpt && allowedOpt) {
                                  e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isCurrentOpt) {
                                  e.currentTarget.style.backgroundColor = 'white';
                                }
                              }}
                            >
                              {isCurrentOpt && <Check size={14} color={tokens.colors.primary[600]} />}
                              <span>{status.name}</span>
                            </button>
                          );
                        })}
                      </div>,
                      document.body
                    )}
                  </div>

                  {/* Priority Dropdown - Inline */}
                  <div style={{ position: 'relative' }} ref={priorityDropdownRef}>
                    {isAdmin || isMember ? (
                      <button
                        ref={priorityButtonRef}
                        onClick={() => {
                          if (!showPriorityDropdown) {
                            const rect = priorityButtonRef.current?.getBoundingClientRect();
                            if (rect) setPriorityMenuPos({ top: rect.bottom + 4, left: rect.left });
                          }
                          setShowPriorityDropdown(!showPriorityDropdown);
                          setShowStatusDropdown(false);
                          setShowAssigneeDropdown(false);
                          setShowLabelsDropdown(false);
                          setShowEpicDropdown(false);
                          setShowSprintDropdown(false);
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: `1px solid ${tokens.colors.neutral[300]}`,
                          backgroundColor: tokens.colors.neutral[50],
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 500,
                          color: tokens.colors.neutral[700],
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = tokens.colors.neutral[100];
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
                        }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: editPriority ? priorityColor(editPriority) : tokens.colors.neutral[400],
                          }}
                        />
                        <span style={{ textTransform: 'capitalize' }}>
                          {editPriority ? (editPriority === 'urgent' ? 'Urgent' : editPriority.toUpperCase()) : 'None'}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                    ) : (
                      <span
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          backgroundColor: tokens.colors.neutral[100],
                          fontSize: 13,
                          fontWeight: 500,
                          color: tokens.colors.neutral[700],
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: ticket.priority ? priorityColor(ticket.priority) : tokens.colors.neutral[400],
                          }}
                        />
                        {ticket.priority ? (ticket.priority === 'urgent' ? 'Urgent' : ticket.priority.toUpperCase()) : 'None'}
                      </span>
                    )}
                    {showPriorityDropdown && priorityMenuPos && createPortal(
                      <div
                        ref={priorityMenuRef}
                        style={{
                          position: 'fixed',
                          top: priorityMenuPos.top,
                          left: priorityMenuPos.left,
                          minWidth: 140,
                          backgroundColor: 'white',
                          border: `1px solid ${tokens.colors.neutral[300]}`,
                          borderRadius: 8,
                          boxShadow: tokens.shadows.lg,
                          zIndex: 100000,
                        }}
                      >
                        {PRIORITIES.map((priority) => (
                          <button
                            key={priority}
                            onClick={() => {
                              handlePriorityChange(priority);
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              backgroundColor: editPriority === priority ? tokens.colors.primary[50] : 'white',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 13,
                              textAlign: 'left',
                              color: tokens.colors.neutral[900],
                            }}
                            onMouseEnter={(e) => {
                              if (editPriority !== priority) {
                                e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (editPriority !== priority) {
                                e.currentTarget.style.backgroundColor = 'white';
                              }
                            }}
                          >
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: priorityColor(priority),
                              }}
                            />
                            <span style={{ textTransform: 'capitalize' }}>
                              {priorityLabel(priority)}
                            </span>
                          </button>
                        ))}
                      </div>,
                      document.body
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {/* Copy link: one click beats hand-selecting the URL from the address bar. */}
                  <button
                    onClick={async () => {
                      const url = `${window.location.origin}/projects/${projectId}/board?ticketId=${ticketId}`;
                      try {
                        await navigator.clipboard.writeText(url);
                        toast.success('Ticket link copied to clipboard');
                      } catch {
                        window.prompt('Copy this link:', url);
                      }
                    }}
                    title="Copy link to this ticket"
                    aria-label="Copy link to this ticket"
                    style={{
                      padding: 6,
                      borderRadius: 6,
                      border: `1px solid ${tokens.colors.neutral[300]}`,
                      backgroundColor: 'white',
                      color: tokens.colors.neutral[700],
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    <LinkIcon size={16} />
                  </button>

                  {/* Watch Button */}
                  {(isAdmin || isMember) && (
                    <button
                      onClick={async () => {
                        try {
                          const isWatching = ticket.watchers?.some((w: any) => w.user_id === user?.id);
                          const endpoint = `${API_URL}/projects/${projectId}/issues/${ticketId}/watch`;
                          await fetch(endpoint, {
                            method: isWatching ? 'DELETE' : 'POST',
                            credentials: 'include',
                          });
                          loadTicketData({ silent: true });
                        } catch (error) {
                          console.error('Error updating watchers:', error);
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: `1px solid ${tokens.colors.neutral[300]}`,
                        backgroundColor: 'white',
                        color: tokens.colors.neutral[700],
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                    >
                      <Eye size={14} />
                      {ticket.watchers?.some((w: any) => w.user_id === user?.id) ? 'Watching' : 'Watch'}
                    </button>
                  )}

                  {/* Clone / Archive / Delete live behind one menu. As five peer
                      buttons — with Delete red and permanently visible — the header
                      gave a destructive action the same weight as opening a clone. */}
                  {(isAdmin || isMember) && (
                    <div style={{ position: 'relative' }} ref={moreMenuRef}>
                      <button
                        onClick={() => setShowMoreMenu((current) => !current)}
                        aria-label="More actions"
                        aria-haspopup="menu"
                        aria-expanded={showMoreMenu}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          border: `1px solid ${tokens.colors.neutral[300]}`,
                          backgroundColor: showMoreMenu ? tokens.colors.neutral[100] : 'white',
                          color: tokens.colors.neutral[700],
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {showMoreMenu && (
                        <div
                          role="menu"
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            right: 0,
                            minWidth: 184,
                            background: '#FFFFFF',
                            border: `1px solid ${tokens.colors.neutral[200]}`,
                            borderRadius: 8,
                            boxShadow: '0 8px 24px rgba(9,30,66,0.18)',
                            padding: '4px 0',
                            zIndex: 1200,
                          }}
                        >
                          {[
                            {
                              label: 'Clone issue',
                              icon: <Copy size={14} />,
                              run: () => setShowCloneModal(true),
                              show: true,
                              danger: false,
                            },
                            {
                              label: ticket.archived ? 'Unarchive' : 'Archive',
                              icon: ticket.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />,
                              run: handleToggleArchive,
                              show: true,
                              danger: false,
                            },
                            {
                              label: 'Delete issue',
                              icon: <Trash2 size={14} />,
                              run: openDeleteConfirm,
                              show: canDelete,
                              danger: true,
                            },
                          ]
                            .filter((item) => item.show)
                            .map((item) => (
                              <button
                                key={item.label}
                                role="menuitem"
                                onClick={() => {
                                  setShowMoreMenu(false);
                                  item.run();
                                }}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '8px 12px',
                                  border: 'none',
                                  background: 'none',
                                  fontSize: 13,
                                  fontFamily: 'inherit',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  color: item.danger
                                    ? tokens.colors.error[600]
                                    : tokens.colors.neutral[800],
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background = tokens.colors.neutral[100])
                                }
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                              >
                                {item.icon}
                                {item.label}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Save Button — only present when there is a change to commit.
                      Hidden while the Details rail is in edit mode, which shows its
                      own Save/Cancel and would otherwise give two Save buttons. */}
                  {(isAdmin || isMember) && (hasChanges() || saving) && (
                    <ButtonCore
                      variant="primary"
                      size="sm"
                      onClick={handleSave}
                      loading={saving}
                      leftIcon={<Check size={14} />}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </ButtonCore>
                  )}

                  {/* Close Button */}
                  <button
                    onClick={onClose}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 8,
                      cursor: 'pointer',
                      color: tokens.colors.neutral[500],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 6,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = tokens.colors.neutral[100];
                      e.currentTarget.style.color = tokens.colors.neutral[700];
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = tokens.colors.neutral[500];
                    }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>
  );
}
