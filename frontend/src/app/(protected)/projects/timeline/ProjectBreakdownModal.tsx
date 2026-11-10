'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { tokens } from '../../../../design-system/tokens';
import { epicsApi, type EpicListItem } from '../../../../lib/api/epics';
import { ticketsAPI, type Page, type Ticket } from '../../../../lib/api/tickets';
import { StatusPill as StatusPillBase } from '../../../../design-system/components/StatusPill';
import type { StatusCategory } from '../../../../lib/statusVisual';
import TicketDetailModal from '../../../../components/TicketDetailModal';
import { EpicDetailModal } from '../../../../components/EpicDetailModal';
import {
  computeCountdown,
  formatDeadline,
  URGENCY_DOT,
  URGENCY_LABEL,
  type Urgency,
} from './countdown';

interface BreakdownProject {
  id: number;
  name: string;
  key: string;
  deadline?: string | null;
  ticket_count: number;
  overdue_count: number;
  epic_count: number;
  epic_overdue_count: number;
}

type Section = 'epics' | 'tickets';

/** Rows shown per page in each section of the breakdown. */
const EPICS_PER_PAGE = 5;
const TICKETS_PER_PAGE = 10;

/**
 * A small coloured pill showing an item's workflow status. Colour comes from the shared
 * status-visual helper (configured colour → tinted chip), so it matches the board.
 */
function StatusPill({
  status,
  color,
  category,
}: {
  status?: string | null;
  color?: string | null;
  category?: StatusCategory | string | null;
}) {
  return <StatusPillBase name={status} color={color} category={category} style={{ flexShrink: 0 }} />;
}

/**
 * Due date + urgency marker, reusing the exact classification the project cards use
 * (overdue / due-soon / on-track). A missing date reads calm and muted rather than alarming.
 */
function DueDate({ dueDate, now }: { dueDate?: string | null; now: number }) {
  const cd = computeCountdown(dueDate, now);
  const color = URGENCY_DOT[cd.urgency];

  if (cd.urgency === 'none') {
    return (
      <span style={{ fontSize: 11, color: tokens.colors.semantic.text.disabled, whiteSpace: 'nowrap' }}>
        No due date
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span
        style={{
          fontSize: 11,
          fontWeight: cd.urgency === 'overdue' || cd.urgency === 'critical' ? 700 : 500,
          color: cd.urgency === 'overdue' || cd.urgency === 'critical' ? color : tokens.colors.semantic.text.secondary,
        }}
      >
        {URGENCY_LABEL[cd.urgency]}
      </span>
      <span style={{ fontSize: 11, color: tokens.colors.semantic.text.tertiary }}>
        · {dueDate ? formatDeadline(dueDate) : ''}
      </span>
    </span>
  );
}

/**
 * A single ticket row. Clicking the row opens the ticket's detail modal; the caret
 * toggles its subtasks (which are themselves clickable to open).
 */
function TicketRow({
  ticket,
  subtasks,
  loadingChildren,
  now,
  expanded,
  onToggle,
  onOpenTicket,
}: {
  ticket: Ticket;
  subtasks: Ticket[];
  /** The subtasks are on their way; this row asked for them. */
  loadingChildren?: boolean;
  now: number;
  expanded: boolean;
  onToggle: () => void;
  onOpenTicket: (ticketId: number) => void;
}) {
  // The count comes with the row, so the expander appears immediately — the
  // subtasks themselves are only fetched if someone opens it.
  const hasChildren = (ticket.subtasks_count ?? 0) > 0 || subtasks.length > 0;

  return (
    <div style={{ borderTop: `1px solid ${tokens.colors.semantic.border.default}` }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenTicket(ticket.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenTicket(ticket.id);
          }
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = tokens.colors.semantic.background.secondary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          cursor: 'pointer',
          background: 'transparent',
          transition: 'background 0.12s',
        }}
      >
        {hasChildren ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              flexShrink: 0,
              color: tokens.colors.semantic.text.secondary,
              cursor: 'pointer',
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        ) : (
          <span aria-hidden style={{ width: 16, flexShrink: 0 }} />
        )}
        <span
          style={{
            flexShrink: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 600,
            color: tokens.colors.semantic.text.tertiary,
          }}
        >
          {ticket.key}
        </span>
        <span
          title={ticket.title}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            color: tokens.colors.semantic.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {ticket.title}
        </span>
        {hasChildren && (
          <span style={{ flexShrink: 0, fontSize: 11, color: tokens.colors.semantic.text.tertiary }}>
            {subtasks.length} {subtasks.length === 1 ? 'subtask' : 'subtasks'}
          </span>
        )}
        <StatusPill status={ticket.status_name} color={ticket.status_color} category={ticket.status_category} />
        <DueDate dueDate={ticket.due_date} now={now} />
      </div>

      {hasChildren && expanded && (
        <div style={{ background: tokens.colors.semantic.background.secondary }}>
          {loadingChildren && subtasks.length === 0 && <LoadingRow />}
          {subtasks.map((st) => (
            <div
              key={st.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenTicket(st.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenTicket(st.id);
                }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = tokens.colors.semantic.background.tertiary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 14px 8px 52px',
                borderTop: `1px solid ${tokens.colors.semantic.border.subtle}`,
                cursor: 'pointer',
                background: 'transparent',
                transition: 'background 0.12s',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: tokens.colors.semantic.text.tertiary,
                }}
              >
                {st.key}
              </span>
              <span
                title={st.title}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12,
                  color: tokens.colors.semantic.text.secondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {st.title}
              </span>
              <StatusPill status={st.status_name} color={st.status_color} category={st.status_category} />
              <DueDate dueDate={st.due_date} now={now} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A single epic row with its progress + due date. Expands to reveal the tickets
 * belonging to the epic (each of which can itself expand to its subtasks).
 */
function EpicRow({
  epic,
  tickets,
  subtasksByParent,
  loadingChildren,
  now,
  expanded,
  onToggle,
  onOpenEpic,
  openTicketId,
  onToggleTicket,
  onOpenTicket,
}: {
  epic: EpicListItem;
  tickets: Ticket[];
  subtasksByParent: Map<number, Ticket[]>;
  /** This epic's tickets are on their way. */
  loadingChildren?: boolean;
  now: number;
  expanded: boolean;
  onToggle: () => void;
  onOpenEpic: (epicId: number) => void;
  openTicketId: number | null;
  onToggleTicket: (ticketId: number) => void;
  onOpenTicket: (ticketId: number) => void;
}) {
  // total_tickets arrives with the epic, so the expander is right before its
  // tickets have been fetched.
  const hasChildren = epic.total_tickets > 0 || tickets.length > 0;

  return (
    <div style={{ borderTop: `1px solid ${tokens.colors.semantic.border.default}` }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenEpic(epic.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenEpic(epic.id);
          }
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = tokens.colors.semantic.background.secondary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          cursor: 'pointer',
          background: 'transparent',
          transition: 'background 0.12s',
        }}
      >
        {hasChildren ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={expanded ? 'Collapse tickets' : 'Expand tickets'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              flexShrink: 0,
              color: tokens.colors.semantic.text.secondary,
              cursor: 'pointer',
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        ) : (
          <span aria-hidden style={{ width: 16, flexShrink: 0 }} />
        )}
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: epic.color, flexShrink: 0 }} />
        <span
          style={{
            flexShrink: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 600,
            color: tokens.colors.semantic.text.tertiary,
          }}
        >
          {epic.key}
        </span>
        <span
          title={epic.title}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            color: tokens.colors.semantic.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {epic.title}
        </span>
        <span style={{ flexShrink: 0, fontSize: 11, color: tokens.colors.semantic.text.tertiary }}>
          {epic.completed_tickets}/{epic.total_tickets} done
        </span>
        <StatusPill status={epic.status} />
        <DueDate dueDate={epic.due_date} now={now} />
      </div>

      {hasChildren && expanded && (
        <div style={{ background: tokens.colors.semantic.background.secondary, paddingLeft: 24 }}>
          {loadingChildren && tickets.length === 0 && <LoadingRow />}
          {tickets.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              subtasks={subtasksByParent.get(t.id) ?? []}
              now={now}
              loadingChildren={false}
              expanded={openTicketId === t.id}
              onToggle={() => onToggleTicket(t.id)}
              onOpenTicket={onOpenTicket}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectBreakdownModal({
  project,
  now,
  onClose,
}: {
  project: BreakdownProject;
  now: number;
  onClose: () => void;
}) {
  // Each section keeps the pages it has fetched, so stepping back is free and
  // stepping forward only costs a request the first time. The whole cache lives
  // in this component, which unmounts when the modal closes.
  const [epicPages, setEpicPages] = useState<Page<EpicListItem>[]>([]);
  const [epicIndex, setEpicIndex] = useState(0);
  const [ticketPages, setTicketPages] = useState<Page<Ticket>[]>([]);
  const [ticketIndex, setTicketIndex] = useState(0);
  // Children, fetched when a row is expanded and kept for the rest of the session.
  const [epicChildren, setEpicChildren] = useState<Map<number, Ticket[]>>(new Map());
  const [subtasks, setSubtasks] = useState<Map<number, Ticket[]>>(new Map());
  const [loadingChildOf, setLoadingChildOf] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Portals need a DOM target, which doesn't exist during SSR; only render once mounted.
  const [mounted, setMounted] = useState(false);

  // Only one top-level section open at a time; opening one collapses the other.
  const [openSection, setOpenSection] = useState<Section | null>('epics');
  // Only one epic's ticket list open at a time.
  const [openEpicId, setOpenEpicId] = useState<number | null>(null);
  // Only one ticket's subtasks open at a time.
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);
  // The ticket / epic whose detail modal is open on top of the breakdown, if any.
  const [detailTicketId, setDetailTicketId] = useState<number | null>(null);
  const [detailEpicId, setDetailEpicId] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Let a stacked detail modal handle its own Escape first; only close the
      // breakdown when nothing is open on top of it.
      if (e.key === 'Escape' && detailTicketId == null && detailEpicId == null) onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock background scroll while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, detailTicketId, detailEpicId]);

  // The first page of each section. Also the refresh after a detail modal reports
  // an edit: the cached pages and children may all be stale by then, so they are
  // dropped and rebuilt rather than patched.
  const loadBreakdown = useCallback(async () => {
    try {
      const [firstEpics, firstTickets] = await Promise.all([
        epicsApi.listEpicsPage(project.id, { limit: EPICS_PER_PAGE }),
        ticketsAPI.getTicketsPage(project.id, { limit: TICKETS_PER_PAGE, no_epic: true }),
      ]);
      setEpicPages([firstEpics]);
      setEpicIndex(0);
      setTicketPages([firstTickets]);
      setTicketIndex(0);
      setEpicChildren(new Map());
      setSubtasks(new Map());
      setOpenEpicId(null);
      setOpenTicketId(null);
    } catch {
      setError('Could not load the breakdown. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void loadBreakdown();
  }, [loadBreakdown]);

  /** Step a section forward, fetching that page only if it hasn't been seen. */
  const goToPage = useCallback(
    async <T,>(
      next: number,
      pages: Page<T>[],
      setPages: React.Dispatch<React.SetStateAction<Page<T>[]>>,
      setIndex: (index: number) => void,
      fetchPage: (cursor: string) => Promise<Page<T>>,
    ) => {
      if (next < 0) return;
      if (next < pages.length) {
        setIndex(next);
        return;
      }
      const cursor = pages[pages.length - 1]?.next_cursor;
      if (!cursor) return;
      try {
        const page = await fetchPage(cursor);
        setPages((prev) => [...prev, page]);
        setIndex(next);
      } catch {
        setError('Could not load that page. Please try again.');
      }
    },
    [],
  );

  /** An epic's tickets, or a ticket's subtasks: fetched on first expand, then kept. */
  const loadChildren = useCallback(
    async (kind: 'epic' | 'ticket', id: number) => {
      const cache = kind === 'epic' ? epicChildren : subtasks;
      if (cache.has(id)) return;
      setLoadingChildOf(id);
      try {
        const rows = await ticketsAPI.getTickets(
          project.id,
          kind === 'epic' ? { epic_id: id } : { parent_id: id, include_subtasks: true },
        );
        const store = kind === 'epic' ? setEpicChildren : setSubtasks;
        store((prev) => new Map(prev).set(id, rows));
      } catch {
        setError('Could not load those issues. Please try again.');
      } finally {
        setLoadingChildOf(null);
      }
    },
    [project.id, epicChildren, subtasks],
  );

  const visibleEpics = epicPages[epicIndex]?.items ?? [];
  const visibleEpiclessTickets = ticketPages[ticketIndex]?.items ?? [];
  const epicTotal = epicPages[0]?.total ?? 0;
  const ticketTotal = ticketPages[0]?.total ?? 0;
  const epicPageCount = Math.max(1, Math.ceil(epicTotal / EPICS_PER_PAGE));
  const ticketPageCount = Math.max(1, Math.ceil(ticketTotal / TICKETS_PER_PAGE));
  const epicStart = epicIndex * EPICS_PER_PAGE;
  const ticketStart = ticketIndex * TICKETS_PER_PAGE;

  // Expanded rows are per-page state: leaving them set would silently re-expand a row
  // that happens to sit on the page you land on.
  const goToEpicPage = (page: number) => {
    setOpenEpicId(null);
    setOpenTicketId(null);
    void goToPage(page - 1, epicPages, setEpicPages, setEpicIndex, (cursor) =>
      epicsApi.listEpicsPage(project.id, { limit: EPICS_PER_PAGE, cursor }),
    );
  };
  const goToTicketPage = (page: number) => {
    setOpenTicketId(null);
    void goToPage(page - 1, ticketPages, setTicketPages, setTicketIndex, (cursor) =>
      ticketsAPI.getTicketsPage(project.id, { limit: TICKETS_PER_PAGE, no_epic: true, cursor }),
    );
  };

  const toggleSection = (section: Section) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const toggleEpic = (epicId: number) => {
    setOpenEpicId((prev) => (prev === epicId ? null : epicId));
    void loadChildren('epic', epicId);
  };

  const toggleTicket = (ticketId: number) => {
    setOpenTicketId((prev) => (prev === ticketId ? null : ticketId));
    void loadChildren('ticket', ticketId);
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(16, 24, 40, 0.55)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    animation: 'pbm-overlay-in 0.15s ease-out',
  };

  if (!mounted) return null;

  return createPortal(
    <>
    <div
      style={overlayStyle}
      onClick={(e) => {
        // Rendered via a portal onto document.body, so this click never reaches the
        // underlying project card. Still stop it so nothing behind the overlay reacts.
        e.stopPropagation();
        onClose();
      }}
    >
      <style>{`
        @keyframes pbm-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pbm-dialog-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${project.name} breakdown`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 760,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: tokens.colors.semantic.background.default,
          borderRadius: tokens.borderRadius.lg,
          boxShadow: tokens.shadows.xl,
          overflow: 'hidden',
          animation: 'pbm-dialog-in 0.18s ease-out',
        }}
      >
        {/* Header: project basics + totals */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: `1px solid ${tokens.colors.semantic.border.default}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2
                  title={project.name}
                  style={{
                    margin: 0,
                    fontSize: 17,
                    fontWeight: 600,
                    color: tokens.colors.semantic.text.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {project.name}
                </h2>
                <span
                  style={{
                    flexShrink: 0,
                    padding: '2px 7px',
                    borderRadius: tokens.borderRadius.xs,
                    background: tokens.colors.semantic.background.tertiary,
                    color: tokens.colors.semantic.text.tertiary,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  {project.key}
                </span>
              </div>
              <div style={{ marginTop: 4 }}>
                <DueDate dueDate={project.deadline} now={now} />
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = tokens.colors.semantic.background.tertiary;
                e.currentTarget.style.color = tokens.colors.semantic.text.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = tokens.colors.semantic.background.default;
                e.currentTarget.style.color = tokens.colors.semantic.text.secondary;
              }}
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: tokens.borderRadius.sm,
                border: `1px solid ${tokens.colors.semantic.border.default}`,
                background: tokens.colors.semantic.background.default,
                color: tokens.colors.semantic.text.secondary,
                cursor: 'pointer',
                fontSize: 15,
                lineHeight: 1,
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Totals strip */}
          <div style={{ display: 'flex', gap: 10 }}>
            <StatChip label="tickets" count={project.ticket_count} overdue={project.overdue_count} />
            <StatChip label="epics" count={project.epic_count} overdue={project.epic_overdue_count} />
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, fontSize: 13, color: tokens.colors.semantic.text.secondary }}>
              Loading breakdown...
            </div>
          ) : error ? (
            <div style={{ padding: 32, fontSize: 13, color: tokens.colors.error[700] }}>{error}</div>
          ) : (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Epics section */}
              <AccordionSection
                label="Epics"
                count={epicTotal}
                open={openSection === 'epics'}
                onToggle={() => toggleSection('epics')}
              >
                {epicTotal === 0 ? (
                  <EmptyRow text="No epics in this project." />
                ) : (
                  visibleEpics.map((epic) => (
                    <EpicRow
                      key={epic.id}
                      epic={epic}
                      tickets={epicChildren.get(epic.id) ?? []}
                      subtasksByParent={subtasks}
                      loadingChildren={loadingChildOf === epic.id}
                      now={now}
                      expanded={openEpicId === epic.id}
                      onToggle={() => toggleEpic(epic.id)}
                      onOpenEpic={setDetailEpicId}
                      openTicketId={openTicketId}
                      onToggleTicket={toggleTicket}
                      onOpenTicket={setDetailTicketId}
                    />
                  ))
                )}
                <Pagination
                  page={epicIndex + 1}
                  pageCount={epicPageCount}
                  total={epicTotal}
                  rangeStart={epicStart + 1}
                  rangeEnd={epicStart + visibleEpics.length}
                  noun="epics"
                  onChange={goToEpicPage}
                />
              </AccordionSection>

              {/* Tickets section: tickets not attached to any epic (epic tickets live
                  under their epic above). Labelled plainly when there are no epics. */}
              <AccordionSection
                label={epicTotal > 0 ? 'Tickets without an epic' : 'Tickets'}
                count={ticketTotal}
                open={openSection === 'tickets'}
                onToggle={() => toggleSection('tickets')}
              >
                {ticketTotal === 0 ? (
                  <EmptyRow text={epicTotal > 0 ? 'Every ticket belongs to an epic.' : 'No tickets in this project.'} />
                ) : (
                  visibleEpiclessTickets.map((ticket) => (
                    <TicketRow
                      key={ticket.id}
                      ticket={ticket}
                      subtasks={subtasks.get(ticket.id) ?? []}
                      loadingChildren={loadingChildOf === ticket.id}
                      now={now}
                      expanded={openTicketId === ticket.id}
                      onToggle={() => toggleTicket(ticket.id)}
                      onOpenTicket={setDetailTicketId}
                    />
                  ))
                )}
                <Pagination
                  page={ticketIndex + 1}
                  pageCount={ticketPageCount}
                  total={ticketTotal}
                  rangeStart={ticketStart + 1}
                  rangeEnd={ticketStart + visibleEpiclessTickets.length}
                  noun="tickets"
                  onChange={goToTicketPage}
                />
              </AccordionSection>
            </div>
          )}
        </div>
      </div>
    </div>
      {/* Detail modals open on top of the breakdown (their own overlay sits above it).
          React events bubble through the component tree even across portals, so a click
          inside these would otherwise reach the timeline card's onClick and navigate to
          the board — stop it here. */}
      <div onClick={(e) => e.stopPropagation()}>
        {detailTicketId != null && (
          <TicketDetailModal
            isOpen
            projectId={project.id}
            ticketId={detailTicketId}
            onClose={() => setDetailTicketId(null)}
            onTicketUpdated={() => void loadBreakdown()}
          />
        )}
        {detailEpicId != null && (
          <EpicDetailModal
            isOpen
            projectId={project.id}
            epicId={detailEpicId}
            onClose={() => setDetailEpicId(null)}
            onEpicUpdated={() => void loadBreakdown()}
          />
        )}
      </div>
    </>,
    document.body,
  );
}

/** Top-level collapsible label ("Epics" / "Tickets") wrapping its item rows. */
function AccordionSection({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${tokens.colors.semantic.border.default}`,
        borderRadius: tokens.borderRadius.md,
        overflow: 'hidden',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = tokens.colors.semantic.background.tertiary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = tokens.colors.semantic.background.secondary;
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          cursor: 'pointer',
          background: tokens.colors.semantic.background.secondary,
          transition: 'background 0.12s',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            color: tokens.colors.semantic.text.secondary,
          }}
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tokens.colors.semantic.text.primary }}>{label}</span>
        <span
          style={{
            padding: '1px 8px',
            borderRadius: 999,
            background: tokens.colors.semantic.background.tertiary,
            color: tokens.colors.semantic.text.secondary,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {count}
        </span>
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

/**
 * Previous / next pager for a section's rows. Renders nothing when everything already
 * fits on one page, so short projects look exactly as they did before.
 */
function Pagination({
  page,
  pageCount,
  total,
  rangeStart,
  rangeEnd,
  noun,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  noun: string;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const buttonStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: tokens.borderRadius.sm,
    border: `1px solid ${tokens.colors.semantic.border.default}`,
    background: tokens.colors.semantic.background.default,
    color: disabled ? tokens.colors.semantic.text.tertiary : tokens.colors.primary[600],
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '8px 14px',
        borderTop: `1px solid ${tokens.colors.semantic.border.default}`,
        background: tokens.colors.semantic.background.secondary,
      }}
    >
      <span style={{ fontSize: 11, color: tokens.colors.semantic.text.tertiary }}>
        {rangeStart}–{rangeEnd} of {total} {noun}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          style={buttonStyle(page <= 1)}
        >
          Previous
        </button>
        <span style={{ fontSize: 11, color: tokens.colors.semantic.text.secondary }}>
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          style={buttonStyle(page >= pageCount)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** A compact stat chip for the header totals strip (e.g. "12 tickets · 3 overdue"). */
function StatChip({ label, count, overdue }: { label: string; count: number; overdue: number }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '5px 10px',
        borderRadius: tokens.borderRadius.sm,
        background: tokens.colors.semantic.background.secondary,
        border: `1px solid ${tokens.colors.semantic.border.subtle}`,
        fontSize: 12,
        color: tokens.colors.semantic.text.secondary,
        whiteSpace: 'nowrap',
      }}
    >
      <strong style={{ fontSize: 14, fontWeight: 700, color: tokens.colors.semantic.text.primary }}>{count}</strong>
      {label}
      {overdue > 0 && (
        <span style={{ color: tokens.colors.error[600], fontWeight: 600 }}>· {overdue} overdue</span>
      )}
    </div>
  );
}

/** Placeholder under an expanded row while its children are being fetched. */
function LoadingRow() {
  return (
    <div
      style={{
        padding: '14px',
        fontSize: 12,
        color: tokens.colors.semantic.text.tertiary,
        borderTop: `1px solid ${tokens.colors.semantic.border.default}`,
      }}
    >
      Loading...
    </div>
  );
}


function EmptyRow({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '14px',
        fontSize: 12,
        color: tokens.colors.semantic.text.tertiary,
        borderTop: `1px solid ${tokens.colors.semantic.border.default}`,
      }}
    >
      {text}
    </div>
  );
}
