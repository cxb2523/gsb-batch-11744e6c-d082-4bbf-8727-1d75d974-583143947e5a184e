'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Download, Info, Keyboard, Play, Square, Users, WifiOff } from 'lucide-react';
import TicketDetailModal from '@/components/TicketDetailModal';
import { useToast, ButtonCore } from '@/components/ui';
import { Avatar } from '@/design-system/components';
import { useAnyTicketsChanged } from '@/lib/ticketEvents';
import {
  AddedSection,
  BlockerNote,
  PersonTicketOption,
  StandupBoard,
  StandupPerson,
  StandupTask,
  StandupTicketRow,
  TaskSection,
  TaskStatus,
  errorStatus,
  standupAPI,
} from '@/lib/api/standup';
import { DateNavigator } from '@/components/standup/DateNavigator';
import { PeopleRail } from '@/components/standup/PeopleRail';
import { type MovingCard, PersonPanel } from '@/components/standup/PersonPanel';
import { RosterModal } from '@/components/standup/RosterModal';
import { StandupSkeleton } from '@/components/standup/StandupSkeleton';
import { StandupStyles } from '@/components/standup/StandupStyles';
import { RailFilter, TeamSummary } from '@/components/standup/TeamSummary';
import { C, LAYER, RADIUS, SHADOW, space } from '@/components/standup/tokens';
import { SHORTCUTS, useStandupKeyboard } from '@/components/standup/useStandupKeyboard';

type LoadError = { title: string; detail: string; offline?: boolean };

function describeLoadError(error: unknown): LoadError {
  const code = errorStatus(error);
  if (code === 'offline') return { title: "You're offline", detail: 'Reconnect to load the standup.', offline: true };
  if (code === 'timeout') return { title: 'The standup is taking too long to load', detail: 'Check your connection and try again.' };
  if (code === 400) return { title: "That date can't be shown", detail: 'Standups are available up to today.' };
  if (code === 403) return { title: "You don't have access to the standup", detail: 'Ask an admin if you think this is wrong.' };
  if (typeof code === 'number' && code >= 500) return { title: 'Something went wrong on our side', detail: 'Try again in a moment.' };
  return { title: "Couldn't load the standup", detail: 'Try again in a moment.' };
}

/** A row for a ticket picked from a picker, until the board reloads with the full details. */
function rowFromOption(ticket: PersonTicketOption): StandupTicketRow {
  return {
    id: ticket.id, project_id: ticket.project_id, key: ticket.key, title: ticket.title, type: ticket.type,
    priority: null, status: null, parent: null, due_date: null, is_overdue: false, archived: false,
    added_by: null, carried_forward: false, carried_from_date: null,
  };
}

let pendingSeq = 0;
const pendingId = () => `pending-${Date.now()}-${pendingSeq++}`;

/** Apply `update` to one person on the board without touching anyone else. */
function patchPerson(board: StandupBoard, email: string, update: (person: StandupPerson) => StandupPerson): StandupBoard {
  return { ...board, people: board.people.map((person) => (person.email === email ? update(person) : person)) };
}

function StandupPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();

  const dateParam = params.get('date') ?? undefined;
  const personParam = params.get('person');
  const present = params.get('present') === '1';
  const manageParam = params.get('manage') === '1';

  const [board, setBoard] = useState<StandupBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [filter, setFilter] = useState<RailFilter>('all');
  const [openTicket, setOpenTicket] = useState<{ projectId: number; ticketId: number } | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const lastLoadedAt = useRef(0);

  /* ---------- URL state ---------- */

  const setQuery = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(changes).forEach(([key, value]) => (value === null ? next.delete(key) : next.set(key, value)));
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /* ---------- loading ---------- */

  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const data = await standupAPI.getBoard(dateParam, controller.signal);
        if (controller.signal.aborted) return;
        setBoard(data);
        setLoadError(null);
        lastLoadedAt.current = Date.now();
      } catch (error) {
        // Superseded by a newer request: that one owns the loading state now.
        if (controller.signal.aborted) return;
        if (silent) return; // keep showing the board we have; the next refresh will try again
        setLoadError(describeLoadError(error));
      } finally {
        if (requestRef.current === controller) setLoading(false);
      }
    },
    [dateParam],
  );

  useEffect(() => {
    load();
    return () => requestRef.current?.abort();
  }, [load]);

  // Only show the skeleton if loading takes a noticeable moment, so fast loads don't flash.
  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), 300);
    return () => clearTimeout(timer);
  }, [loading]);

  // Tickets edited anywhere in the app (quick add, ticket modal, board) refresh the standup.
  useAnyTicketsChanged(() => load({ silent: true }));

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoadedAt.current > 60_000) load({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  useEffect(() => {
    if (manageParam && board?.is_admin) setRosterOpen(true);
  }, [manageParam, board?.is_admin]);

  /* ---------- people ---------- */

  const people = useMemo(() => {
    const all = board?.people ?? [];
    if (filter === 'blocked') return all.filter((person) => person.health === 'blocked');
    if (filter === 'no_update') return all.filter((person) => person.health === 'no_update');
    return all;
  }, [board, filter]);

  // No one picked yet: open the viewer's own board, falling back to the first person.
  const defaultIndex = Math.max(0, people.findIndex((person) => person.email === board?.viewer_email));
  const chosenIndex = people.findIndex((person) => person.email === personParam);
  const selectedIndex = chosenIndex >= 0 ? chosenIndex : defaultIndex;
  const selected = people[selectedIndex] ?? null;

  const selectPerson = useCallback((email: string) => setQuery({ person: email }), [setQuery]);
  const step = useCallback(
    (delta: number) => {
      const next = people[selectedIndex + delta];
      if (next) {
        setQuery({ person: next.email });
        if (present) window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [people, selectedIndex, setQuery, present],
  );

  /* ---------- today: pin / remove ---------- */

  const date = board?.date ?? '';

  const findRow = (person: StandupPerson, ticketId: number): StandupTicketRow | undefined =>
    [...person.today.items, ...person.yesterday.items, ...person.blockers].find(
      (row) => row.id === ticketId,
    );

  const mutate = useCallback(
    async ({
      person,
      optimistic,
      request,
      success,
      undo,
      failure,
    }: {
      person: StandupPerson;
      optimistic: (person: StandupPerson) => StandupPerson;
      request: () => Promise<unknown>;
      /** Omitted when the change is plainly visible where the user acted. */
      success?: string;
      undo?: () => void;
      /** Message for a failure; a function can pick one by status code. */
      failure: string | ((code: ReturnType<typeof errorStatus>) => string);
    }) => {
      const before = board;
      setBoard((current) => (current ? patchPerson(current, person.email, optimistic) : current));
      try {
        await request();
        if (success) toast.success(success, undo ? { label: 'Undo', run: undo } : undefined);
        load({ silent: true }); // reconcile with the server's view
      } catch (error) {
        setBoard(before);
        const code = errorStatus(error);
        const message = typeof failure === 'function' ? failure(code) : failure;
        toast.error(code === 'offline' ? `You're offline. ${message}` : message);
      }
    },
    [board, load, toast],
  );

  /* ---------- tickets: every column is added to and removed from by hand ---------- */

  type Column = 'today' | AddedSection;

  const columnRows = (person: StandupPerson, column: Column): StandupTicketRow[] =>
    column === 'today' ? person.today.items : column === 'yesterday' ? person.yesterday.items : person.blockers;

  const withColumnRows = (person: StandupPerson, column: Column, rows: StandupTicketRow[]): StandupPerson =>
    column === 'today'
      ? { ...person, today: { ...person.today, items: rows } }
      : column === 'yesterday'
        ? { ...person, yesterday: { ...person.yesterday, items: rows } }
        : { ...person, blockers: rows };

  const columnName = (column: Column) => (column === 'blockers' ? 'blockers' : column);

  const saveTicket = (column: Column, params: { email: string; date: string; ticket_id: number }) =>
    column === 'today' ? standupAPI.setTodayItem(params) : standupAPI.addTicketItem(column, params);

  const deleteTicket = (column: Column, params: { email: string; date: string; ticket_id: number }) =>
    column === 'today' ? standupAPI.removeTodayItem(params) : standupAPI.removeTicketItem(column, params);

  const addTicket = useCallback(
    (column: Column, person: StandupPerson, row: StandupTicketRow, { withUndo = true, index }: { withUndo?: boolean; index?: number } = {}) => {
      const first = person.name.split(' ')[0];
      const params = { email: person.email, date, ticket_id: row.id };
      mutate({
        person,
        optimistic: (p) => {
          const rows = columnRows(p, column).filter((r) => r.id !== row.id);
          rows.splice(index === undefined ? rows.length : Math.min(index, rows.length), 0, row);
          return withColumnRows(p, column, rows);
        },
        request: () => saveTicket(column, params),
        success: withUndo ? `Added ${row.key} to ${first}'s ${columnName(column)}` : `${row.key} is back in ${first}'s ${columnName(column)}`,
        undo: withUndo ? () => removeTicket(column, person, row, { withUndo: false }) : undefined,
        failure: `Couldn't add ${row.key}. Try again.`,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, mutate],
  );

  const removeTicket = useCallback(
    (column: Column, person: StandupPerson, row: StandupTicketRow, { withUndo = true } = {}) => {
      const first = person.name.split(' ')[0];
      const index = columnRows(person, column).findIndex((r) => r.id === row.id);
      mutate({
        person,
        optimistic: (p) => withColumnRows(p, column, columnRows(p, column).filter((r) => r.id !== row.id)),
        request: () => deleteTicket(column, { email: person.email, date, ticket_id: row.id }),
        success: `Removed ${row.key} from ${first}'s ${columnName(column)}`,
        undo: withUndo ? () => addTicket(column, person, row, { withUndo: false, index }) : undefined,
        failure: `Couldn't remove ${row.key}. Try again.`,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, mutate, addTicket],
  );

  /* ---------- carry a ticket to the next working day ---------- */

  const carryTicket = useCallback(
    (person: StandupPerson, row: StandupTicketRow, { withUndo = true } = {}) => {
      if (!board) return;
      const target = board.carry_forward_date;
      const day = format(parseISO(target), 'EEE');
      const carried = !row.carried_forward;
      const params = { email: person.email, date: target, ticket_id: row.id };
      mutate({
        person,
        optimistic: (p) => ({
          ...p,
          today: { ...p.today, items: p.today.items.map((item) => (item.id === row.id ? { ...item, carried_forward: carried } : item)) },
        }),
        request: () => (carried ? standupAPI.setTodayItem(params) : standupAPI.removeTodayItem(params)),
        success: carried ? `Carried ${row.key} to ${day}` : `${row.key} won't carry to ${day}`,
        undo: withUndo ? () => carryTicket(person, { ...row, carried_forward: carried }, { withUndo: false }) : undefined,
        failure: `Couldn't update ${row.key}. Try again.`,
      });
    },
    [board, mutate],
  );

  /* ---------- adhoc tasks ---------- */

  const taskList = (section: TaskSection) => (section === 'yesterday' ? 'yesterday' : 'today');

  const patchTasks = (person: StandupPerson, section: TaskSection, update: (tasks: StandupTask[]) => StandupTask[]): StandupPerson =>
    taskList(section) === 'yesterday'
      ? { ...person, yesterday: { ...person.yesterday, tasks: update(person.yesterday.tasks) } }
      : { ...person, today: { ...person.today, tasks: update(person.today.tasks) } };

  const addTask = useCallback(
    async (person: StandupPerson, section: TaskSection, text: string, status: TaskStatus = 'todo'): Promise<boolean> => {
      const temp: StandupTask = {
        id: pendingId(), section, text, status, created_by: null, created_at: new Date().toISOString(), carried_from: null, carried_forward: false,
      };
      setBoard((current) => (current ? patchPerson(current, person.email, (p) => patchTasks(p, section, (tasks) => [...tasks, temp])) : current));
      try {
        const saved = await standupAPI.addTask({ email: person.email, date, section, text, status });
        setBoard((current) =>
          current ? patchPerson(current, person.email, (p) => patchTasks(p, section, (tasks) => tasks.map((t) => (t.id === temp.id ? saved : t)))) : current,
        );
        load({ silent: true });
        return true;
      } catch {
        setBoard((current) =>
          current ? patchPerson(current, person.email, (p) => patchTasks(p, section, (tasks) => tasks.filter((t) => t.id !== temp.id))) : current,
        );
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, load],
  );

  const setTaskStatus = useCallback(
    (person: StandupPerson, task: StandupTask, status: TaskStatus) => {
      mutate({
        person,
        optimistic: (p) => patchTasks(p, task.section, (tasks) => tasks.map((t) => (t.id === task.id ? { ...t, status } : t))),
        request: () => standupAPI.updateTask(task.id, { status }),
        failure: "Couldn't change the task's status. Try again.",
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate],
  );

  const editTask = useCallback(
    (person: StandupPerson, task: StandupTask, text: string) => {
      const trimmed = text.trim();
      if (!trimmed || trimmed === task.text) return;
      mutate({
        person,
        optimistic: (p) => patchTasks(p, task.section, (tasks) => tasks.map((t) => (t.id === task.id ? { ...t, text: trimmed } : t))),
        request: () => standupAPI.updateTask(task.id, { text: trimmed }),
        success: 'Task updated',
        failure: "Couldn't update the task. Try again.",
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate],
  );

  const carryTask = useCallback(
    (person: StandupPerson, task: StandupTask) => {
      if (!board) return;
      const where = task.section === 'yesterday' ? 'today' : format(parseISO(board.carry_forward_date), 'EEE');
      mutate({
        person,
        optimistic: (p) => patchTasks(p, task.section, (tasks) => tasks.map((t) => (t.id === task.id ? { ...t, carried_forward: true } : t))),
        request: () => standupAPI.carryTaskForward(task.id),
        success: `Carried task to ${where}`,
        failure: "Couldn't carry the task forward. Try again.",
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, mutate],
  );

  const removeTask = useCallback(
    (person: StandupPerson, task: StandupTask) => {
      mutate({
        person,
        optimistic: (p) => patchTasks(p, task.section, (tasks) => tasks.filter((t) => t.id !== task.id)),
        request: () => standupAPI.removeTask(task.id),
        success: 'Task deleted',
        undo: () => {
          addTask(person, task.section, task.text, task.status).then((ok) => {
            if (!ok) toast.error("Couldn't restore the task. Try again.");
          });
        },
        failure: "Couldn't delete the task. Try again.",
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate, addTask, toast],
  );

  /* ---------- blocker notes ---------- */

  const addBlocker = useCallback(
    async (person: StandupPerson, text: string): Promise<boolean> => {
      const temp: BlockerNote = { id: pendingId(), text, created_by: null, created_at: new Date().toISOString(), carried_from_date: null };
      setBoard((current) => (current ? patchPerson(current, person.email, (p) => ({ ...p, blocker_notes: [...p.blocker_notes, temp] })) : current));
      try {
        const saved = await standupAPI.addBlockerNote({ email: person.email, date, text });
        setBoard((current) =>
          current ? patchPerson(current, person.email, (p) => ({ ...p, blocker_notes: p.blocker_notes.map((n) => (n.id === temp.id ? saved : n)) })) : current,
        );
        load({ silent: true });
        return true;
      } catch {
        setBoard((current) =>
          current ? patchPerson(current, person.email, (p) => ({ ...p, blocker_notes: p.blocker_notes.filter((n) => n.id !== temp.id) })) : current,
        );
        return false;
      }
    },
    [date, load],
  );

  const removeBlocker = useCallback(
    (person: StandupPerson, note: BlockerNote) => {
      mutate({
        person,
        optimistic: (p) => ({ ...p, blocker_notes: p.blocker_notes.filter((n) => n.id !== note.id) }),
        request: () => standupAPI.removeBlockerNote(note.id),
        success: 'Blocker deleted',
        undo: () => {
          addBlocker(person, note.text).then((ok) => {
            if (!ok) toast.error("Couldn't restore the blocker. Try again.");
          });
        },
        failure: "Couldn't delete the blocker. Try again.",
      });
    },
    [mutate, addBlocker, toast],
  );

  const exportWork = useCallback(
    async (person: StandupPerson) => {
      setExporting(true);
      try {
        await standupAPI.exportWork(person.email, person.name);
        toast.success(`Exported ${person.name.split(' ')[0]}'s standup work`);
      } catch (error) {
        const code = errorStatus(error);
        toast.error(
          code === 'offline'
            ? "You're offline. The export needs a connection."
            : code === 403
              ? "You can only export your own standup work."
              : "Couldn't build the export. Try again.",
        );
      } finally {
        setExporting(false);
      }
    },
    [toast],
  );

  /** Drag a card between Yesterday and Today: it moves, it's never copied. Undo moves it back. */
  const moveCard = useCallback(
    (person: StandupPerson, card: MovingCard, to: 'yesterday' | 'today', { withUndo = true } = {}) => {
      if (!board) return;
      const from = card.from;
      const columnName = (column: 'yesterday' | 'today') => (column === 'today' ? 'Today' : board.yesterday_window.since_label);
      const label = card.kind === 'ticket' ? card.row.key : `"${card.task.text.slice(0, 40)}"`;
      mutate({
        person,
        optimistic: (p) => {
          if (card.kind === 'ticket') {
            const without = (rows: StandupTicketRow[]) => rows.filter((row) => row.id !== card.row.id);
            const yesterday = to === 'yesterday' ? [...without(p.yesterday.items), card.row] : without(p.yesterday.items);
            const today = to === 'today' ? [...without(p.today.items), card.row] : without(p.today.items);
            return { ...p, yesterday: { ...p.yesterday, items: yesterday }, today: { ...p.today, items: today } };
          }
          const moved = { ...card.task, section: to };
          const without = (tasks: StandupTask[]) => tasks.filter((task) => task.id !== card.task.id);
          return {
            ...p,
            yesterday: { ...p.yesterday, tasks: to === 'yesterday' ? [...without(p.yesterday.tasks), moved] : without(p.yesterday.tasks) },
            today: { ...p.today, tasks: to === 'today' ? [...without(p.today.tasks), moved] : without(p.today.tasks) },
          };
        },
        request: () =>
          standupAPI.moveCard({
            email: person.email, date, kind: card.kind, to,
            ...(card.kind === 'ticket' ? { ticket_id: card.row.id } : { task_id: card.task.id }),
          }),
        success: `Moved ${label} to ${columnName(to)}`,
        undo: withUndo
          ? () => {
              const back: MovingCard = card.kind === 'ticket' ? { ...card, from: to } : { ...card, task: { ...card.task, section: to }, from: to };
              moveCard(person, back, from, { withUndo: false });
            }
          : undefined,
        failure: (code) => (code === 409 ? `${label} is already in ${columnName(to)}` : `Couldn't move ${label}. Try again.`),
      });
    },
    [board, date, mutate],
  );

  const nameFor = useCallback(
    (email: string) => board?.people.find((p) => p.email === email)?.name ?? email.split('@')[0],
    [board],
  );

  /* ---------- keyboard ---------- */

  const togglePresent = useCallback(() => setQuery({ present: present ? null : '1' }), [present, setQuery]);

  useStandupKeyboard(Boolean(board) && !openTicket && !rosterOpen, {
    nextPerson: () => step(1),
    prevPerson: () => step(-1),
    prevDate: () => board && setQuery({ date: board.prev_date }),
    nextDate: () => board?.next_date && setQuery({ date: board.next_date }),
    togglePresent,
    exitPresent: () => {
      if (helpOpen) setHelpOpen(false);
      else if (present) setQuery({ present: null });
    },
    toggleHelp: () => setHelpOpen((value) => !value),
    pinFocused: (ticketId, section) => {
      // Adds a yesterday or blocker ticket to today; today's own rows are already there.
      if (!selected?.can_edit || !board?.is_today || section === 'today') return;
      const row = findRow(selected, ticketId);
      if (row && !selected.today.items.some((item) => item.id === row.id)) addTicket('today', selected, row);
    },
    moveFocused: (ticketId, section) => {
      if (!selected?.can_edit || !board?.is_today || (section !== 'yesterday' && section !== 'today')) return;
      const row = findRow(selected, ticketId);
      if (!row) return;
      const to = section === 'yesterday' ? 'today' : 'yesterday';
      const target = to === 'today' ? selected.today.items : selected.yesterday.items;
      if (target.some((item) => item.id === row.id)) {
        toast.error(`${row.key} is already in ${to === 'today' ? 'Today' : board.yesterday_window.since_label}`);
        return;
      }
      moveCard(selected, { kind: 'ticket', row, from: section }, to);
    },
    removeFocused: (ticketId, section) => {
      if (!selected?.can_edit || !board?.is_today) return;
      const row = findRow(selected, ticketId);
      if (row) removeTicket(section === 'blocker' ? 'blockers' : (section as Column), selected, row);
    },
  });

  /* ---------- render ---------- */

  // After changing the date, the previous date's board must not stand in for the new one.
  const showingRequested = board ? (dateParam ? board.date === dateParam : board.is_today) : false;

  const summaryLine = board
    ? `${board.yesterday_window.since_label}: ${format(parseISO(board.prev_date), 'EEE, d MMM')} · Times in IST`
    : 'Loading…';

  return (
    <div style={{ minHeight: '100%', background: C.page }}>
      <StandupStyles />

      {/* Header */}
      <header
        className="su-header"
        style={{
          zIndex: LAYER.sticky,
          background: C.surface, borderBottom: `1px solid ${C.borderStrong}`,
        }}
      >
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: `${space(1.5)}px ${space(3)}px`, display: 'flex', alignItems: 'center', gap: space(3), flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: C.text, letterSpacing: -0.2 }}>Daily Standup</h1>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{summaryLine}</div>
          </div>

          {board && (
            <DateNavigator
              date={board.date}
              today={board.today}
              prevDate={board.prev_date}
              nextDate={board.next_date}
              onChange={(value) => setQuery({ date: value === board.today ? null : value })}
            />
          )}

          <div style={{ flex: 1 }} />

          {board && board.people.length > 0 && <TeamSummary summary={board.summary} filter={filter} onFilter={setFilter} />}

          <div style={{ display: 'flex', alignItems: 'center', gap: space(1) }}>
            <button type="button" className="su-icon-btn su-icon-btn--bordered" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setHelpOpen((v) => !v)}>
              <Keyboard size={16} />
            </button>
            {selected?.can_edit && (
              <ButtonCore
                variant="secondary"
                size="lg"
                onClick={() => exportWork(selected)}
                disabled={exporting}
                title={`Download every standup entry for ${selected.name}, all time, as an Excel file`}
                leftIcon={<Download size={16} aria-hidden />}
              >
                {exporting ? 'Preparing…' : 'Export Work'}
              </ButtonCore>
            )}
            {board?.is_admin && (
              <ButtonCore variant="secondary" size="lg" onClick={() => setRosterOpen(true)} leftIcon={<Users size={16} aria-hidden />}>
                Manage People
              </ButtonCore>
            )}
            <span title={!board?.people.length ? 'Add people to the standup first' : undefined}>
              <ButtonCore variant="primary" size="lg" onClick={togglePresent} disabled={!board?.people.length} aria-pressed={present} leftIcon={present ? <Square size={14} aria-hidden /> : <Play size={14} aria-hidden />}>
                {present ? 'Stop Presenting' : 'Start Standup'}
              </ButtonCore>
            </span>
          </div>
        </div>

        {present && board && people.length > 0 && (
          <div style={{ maxWidth: 1440, margin: '0 auto', padding: `0 ${space(3)}px ${space(1.5)}px`, display: 'flex', alignItems: 'center', gap: space(1.5) }}>
            <div role="progressbar" aria-label="Standup progress" aria-valuemin={1} aria-valuemax={people.length} aria-valuenow={selectedIndex + 1} style={{ flex: 1, height: 4, background: C.divider, borderRadius: RADIUS.pill, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: C.accent, transformOrigin: 'left', transform: `scaleX(${(selectedIndex + 1) / people.length})`, transition: 'transform 200ms ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {people.map((person, index) => (
                <button
                  key={person.email}
                  type="button"
                  aria-label={`Go to ${person.name}`}
                  title={person.name}
                  onClick={() => selectPerson(person.email)}
                  style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: '50%', opacity: index === selectedIndex ? 1 : 0.55, boxShadow: index === selectedIndex ? `0 0 0 2px ${C.accent}` : 'none', transition: 'opacity 150ms ease' }}
                >
                  <Avatar name={person.name} src={person.photo} colorful size={24} />
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {helpOpen && (
        <div role="dialog" aria-label="Keyboard shortcuts" style={{ position: 'fixed', right: space(3), top: 88, zIndex: LAYER.popover, width: 320, background: C.surface, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, boxShadow: SHADOW.overlay, padding: space(2) }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(1) }}>
            <strong style={{ fontSize: 14, color: C.text }}>Keyboard Shortcuts</strong>
            <button type="button" className="su-link-btn" onClick={() => setHelpOpen(false)}>Close</button>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space(1), fontSize: 13, color: C.textBody }}>
                <span>{shortcut.label}</span>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {shortcut.keys.map((key) => (
                    <kbd key={key} style={{ minWidth: 24, height: 22, padding: '0 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}`, borderBottomWidth: 2, borderRadius: RADIUS.sm, background: C.surfaceSunken, fontSize: 11, fontFamily: 'inherit', color: C.text }}>
                      {key}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <main style={{ maxWidth: 1440, margin: '0 auto', padding: space(3) }}>
        {/* Banners */}
        {board && !board.is_today && (
          <Banner icon={<Info size={16} />}>
            Viewing the standup for {format(parseISO(board.date), 'EEEE, d MMM yyyy')}. Tickets show their current state. Adding, carrying forward and editing only work on today&apos;s standup.
          </Banner>
        )}
        {board?.is_weekend && (
          <Banner icon={<Info size={16} />}>This is a weekend. Monday&apos;s standup covers weekend work.</Banner>
        )}

        {/* Body */}
        {loading && !showingRequested ? (
          showSkeleton ? <StandupSkeleton /> : null
        ) : loadError && !showingRequested ? (
          <CenteredState
            icon={loadError.offline ? <WifiOff size={24} /> : <AlertTriangle size={24} />}
            title={loadError.title}
            detail={loadError.detail}
            action={<ButtonCore variant="primary" size="lg" onClick={() => load()}>Try Again</ButtonCore>}
          />
        ) : board && board.people.length === 0 ? (
          board.is_admin ? (
            <CenteredState
              icon={<Users size={24} />}
              title="Pick who's in the standup"
              detail="Add the people who give updates. You can reorder them to set the speaking order."
              action={<ButtonCore variant="primary" size="lg" onClick={() => setRosterOpen(true)} leftIcon={<Users size={16} aria-hidden />}>Add People</ButtonCore>}
            />
          ) : (
            <CenteredState icon={<Users size={24} />} title="The standup isn't set up yet" detail="Ask an admin to add the people who give updates." />
          )
        ) : board && people.length === 0 ? (
          <CenteredState
            icon={<Users size={24} />}
            title={filter === 'blocked' ? 'No one is blocked' : 'Everyone has an update'}
            detail="Nobody matches this filter."
            action={<ButtonCore variant="secondary" size="lg" onClick={() => setFilter('all')}>Show Everyone</ButtonCore>}
          />
        ) : board && selected ? (
          <div className="su-layout" style={present ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
            {!present && <PeopleRail people={people} selectedEmail={selected.email} onSelect={selectPerson} />}
            <PersonPanel
              key={`${selected.email}-${board.date}`}
              board={board}
              person={selected}
              position={selectedIndex + 1}
              total={people.length}
              present={present}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onOpen={(row) => setOpenTicket({ projectId: row.project_id, ticketId: row.id })}
              onTogglePin={(person, row) => addTicket('today', person, row)}
              onRemoveToday={(person, row) => removeTicket('today', person, row)}
              onAddToday={(person, ticket) => addTicket('today', person, rowFromOption(ticket))}
              onCarryTicket={(person, row) => carryTicket(person, row)}
              onAddYesterday={(person, ticket) => addTicket('yesterday', person, rowFromOption(ticket))}
              onRemoveYesterday={(person, row) => removeTicket('yesterday', person, row)}
              onAddBlockerTicket={(person, ticket) => addTicket('blockers', person, rowFromOption(ticket))}
              onRemoveBlockerTicket={(person, row) => removeTicket('blockers', person, row)}
              onAddTask={(person, section, text) => addTask(person, section, text)}
              onTaskStatus={setTaskStatus}
              onCarryTask={carryTask}
              onEditTask={editTask}
              onRemoveTask={removeTask}
              onAddBlocker={addBlocker}
              onRemoveBlocker={removeBlocker}
              onMove={moveCard}
              nameFor={nameFor}
            />
          </div>
        ) : null}
      </main>

      {openTicket && (
        <TicketDetailModal
          isOpen
          projectId={openTicket.projectId}
          ticketId={openTicket.ticketId}
          onClose={() => {
            setOpenTicket(null);
            load({ silent: true });
          }}
          onTicketUpdated={() => load({ silent: true })}
        />
      )}

      <RosterModal
        isOpen={rosterOpen}
        onClose={() => {
          setRosterOpen(false);
          if (manageParam) setQuery({ manage: null });
        }}
        onSaved={() => load({ silent: true })}
      />
    </div>
  );
}

function Banner({ icon, tone = 'info', children }: { icon: React.ReactNode; tone?: 'info' | 'warning'; children: React.ReactNode }) {
  const colors = tone === 'warning' ? { bg: C.warningSoft, fg: C.warning, border: '#FFE2BD' } : { bg: C.accentSoft, fg: '#0055CC', border: C.accentSoftBorder };
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: space(1), marginBottom: space(2), padding: `${space(1)}px ${space(2)}px`, background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}`, borderRadius: RADIUS.md, fontSize: 13 }}>
      <span aria-hidden style={{ display: 'inline-flex' }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function CenteredState({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 440, margin: `${space(8)}px auto`, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space(1.5) }}>
      <span aria-hidden style={{ width: 48, height: 48, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.textSubtle }}>
        {icon}
      </span>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: C.text }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 14, color: C.textMuted, lineHeight: 1.5 }}>{detail}</p>
      {action}
    </div>
  );
}

export default function StandupRoute() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={null}>
      <StandupPage />
    </Suspense>
  );
}
