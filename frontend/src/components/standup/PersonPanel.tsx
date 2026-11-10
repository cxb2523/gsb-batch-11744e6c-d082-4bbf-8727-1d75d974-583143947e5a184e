'use client';

import React, { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertOctagon, CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, History, Inbox, UserX } from 'lucide-react';
import { Avatar } from '@/design-system/components';
import {
  BLOCKER_NOTE_MAX,
  TASK_TEXT_MAX,
  type BlockerNote,
  type PersonTicketOption,
  type StandupBoard,
  type StandupPerson,
  type StandupTask,
  type StandupTicketRow as Row,
  type TaskSection,
  type TaskStatus,
} from '@/lib/api/standup';
import { AddTicketPicker } from './AddTicketPicker';
import { BlockerNotes } from './BlockerNotes';
import { QuickAddInput } from './QuickAddInput';
import { ColumnEmpty, type DropZone, ProjectGroupHeading, StandupColumn } from './StandupColumn';
import { StandupTaskRow } from './StandupTaskRow';
import { type DragHandlers, type LinkState, RowVariant, StandupTicketRow } from './StandupTicketRow';
import { C, HEALTH_STYLE, LINK_COLORS, RADIUS, SHADOW, space } from './tokens';

const TODAY_VISIBLE = 12;

export interface PersonPanelHandlers {
  onOpen: (row: Row) => void;
  onTogglePin: (person: StandupPerson, row: Row) => void;
  onRemoveToday: (person: StandupPerson, row: Row) => void;
  onAddToday: (person: StandupPerson, ticket: PersonTicketOption) => void;
  onAddYesterday: (person: StandupPerson, ticket: PersonTicketOption) => void;
  onRemoveYesterday: (person: StandupPerson, row: Row) => void;
  onAddBlockerTicket: (person: StandupPerson, ticket: PersonTicketOption) => void;
  onRemoveBlockerTicket: (person: StandupPerson, row: Row) => void;
  onCarryTicket: (person: StandupPerson, row: Row) => void;
  onAddTask: (person: StandupPerson, section: TaskSection, text: string) => Promise<boolean>;
  onTaskStatus: (person: StandupPerson, task: StandupTask, status: TaskStatus) => void;
  onCarryTask: (person: StandupPerson, task: StandupTask) => void;
  onEditTask: (person: StandupPerson, task: StandupTask, text: string) => void;
  onRemoveTask: (person: StandupPerson, task: StandupTask) => void;
  onAddBlocker: (person: StandupPerson, text: string) => Promise<boolean>;
  onRemoveBlocker: (person: StandupPerson, note: BlockerNote) => void;
  onMove: (person: StandupPerson, card: MovingCard, to: 'yesterday' | 'today') => void;
}

/** A card being moved between Yesterday and Today. */
export type MovingCard =
  | { kind: 'ticket'; row: Row; from: 'yesterday' | 'today' }
  | { kind: 'task'; task: StandupTask; from: 'yesterday' | 'today' };

interface Props extends PersonPanelHandlers {
  board: StandupBoard;
  person: StandupPerson;
  position: number;
  total: number;
  present: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Display name for an email, falling back to its local part. */
  nameFor: (email: string) => string;
}

function InsightChip({ severity, children }: { severity: 'info' | 'warning' | 'danger'; children: React.ReactNode }) {
  const tone = {
    info: { bg: C.surfaceSunken, fg: C.textSubtle },
    warning: { bg: C.warningSoft, fg: C.warning },
    danger: { bg: C.dangerSoft, fg: C.danger },
  }[severity];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 8px', borderRadius: RADIUS.pill, background: tone.bg, color: tone.fg, fontSize: 12, fontWeight: 600 }}>
      {children}
    </span>
  );
}

/** Rows split by project, keeping each project where its most important row already sits. */
function groupByProject(rows: Row[]): { projectId: number; rows: Row[] }[] {
  const groups = new Map<number, Row[]>();
  rows.forEach((row) => {
    const group = groups.get(row.project_id);
    if (group) group.push(row);
    else groups.set(row.project_id, [row]);
  });
  return Array.from(groups, ([projectId, grouped]) => ({ projectId, rows: grouped }));
}

function TaskGroupHeading({ count }: { count: number }) {
  return <ProjectGroupHeading name="Adhoc Tasks" count={count} />;
}

export function PersonPanel(props: Props) {
  const { board, person, position, total, present, onPrev, onNext, onOpen, nameFor } = props;
  const [showAllToday, setShowAllToday] = useState(false);
  // Past standups are fixed, and a board belongs to its person (admins excepted).
  const readOnly = !board.is_today || !person.can_edit;
  const since = board.yesterday_window.since_label.toLowerCase();
  const first = person.name.split(' ')[0];
  const carryDay = format(parseISO(board.carry_forward_date), 'EEE');

  const plannedIds = useMemo(() => new Set(person.today.items.map((row) => row.id)), [person.today.items]);
  // A removed ticket isn't excluded, so it can be added back from the picker.
  const todayPickerExclude = plannedIds;
  const yesterdayRows = person.yesterday.items;
  const yesterdayPickerExclude = useMemo(() => new Set(yesterdayRows.map((row) => row.id)), [yesterdayRows]);
  const blockerPickerExclude = useMemo(() => new Set(person.blockers.map((row) => row.id)), [person.blockers]);

  // Work that is in both Yesterday and Today: tickets by id, adhoc tasks by the copy they came from.
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const continuedTicketIds = useMemo(() => {
    const planned = new Set(person.today.items.map((row) => row.id));
    return new Set(person.yesterday.items.filter((row) => planned.has(row.id)).map((row) => row.id));
  }, [person.yesterday.items, person.today.items]);
  const continuedTaskIds = useMemo(() => {
    const links = new Map<string, string>();
    const yesterdayIds = new Set(person.yesterday.tasks.map((task) => task.id));
    person.today.tasks.forEach((task) => {
      if (task.carried_from && yesterdayIds.has(task.carried_from)) {
        links.set(task.id, task.carried_from);
        links.set(task.carried_from, task.id);
      }
    });
    return links;
  }, [person.yesterday.tasks, person.today.tasks]);

  // One colour per pair, in the order the pairs appear in Yesterday.
  const linkColors = useMemo(() => {
    const keys: string[] = [];
    person.yesterday.items.forEach((row) => continuedTicketIds.has(row.id) && keys.push(`ticket-${row.id}`));
    person.yesterday.tasks.forEach((task) => continuedTaskIds.has(task.id) && keys.push(`task-${task.id}`));
    return new Map(keys.map((key, index) => [key, LINK_COLORS[index % LINK_COLORS.length]]));
  }, [person.yesterday.items, person.yesterday.tasks, continuedTicketIds, continuedTaskIds]);

  const linkFor = (key: string | null, side: 'yesterday' | 'today'): LinkState | undefined => {
    const color = key === null ? undefined : linkColors.get(key);
    if (key === null || !color) return undefined;
    return { side, color, highlighted: hoveredLink === key, onHover: (on) => setHoveredLink(on ? key : null) };
  };

  // ---- drag and drop between Yesterday and Today ----
  const [dragging, setDragging] = useState<MovingCard | null>(null);
  const [dropTarget, setDropTarget] = useState<'yesterday' | 'today' | null>(null);

  const cardKey = (card: MovingCard) => (card.kind === 'ticket' ? `ticket-${card.row.id}` : `task-${card.task.id}`);

  /** Already in the target column: the same ticket, or this task's linked copy. */
  const alreadyThere = (card: MovingCard, to: 'yesterday' | 'today') =>
    card.kind === 'ticket'
      ? (to === 'today' ? person.today.items : person.yesterday.items).some((row) => row.id === card.row.id)
      : continuedTaskIds.has(card.task.id);

  const dragFor = (card: MovingCard): DragHandlers | undefined =>
    readOnly
      ? undefined
      : {
          active: dragging !== null && cardKey(dragging) === cardKey(card),
          onStart: () => setDragging(card),
          onEnd: () => {
            setDragging(null);
            setDropTarget(null);
          },
        };

  const dropZone = (column: 'yesterday' | 'today'): DropZone | undefined => {
    if (!dragging || dragging.from === column) return undefined;
    const invalid = alreadyThere(dragging, column);
    const name = column === 'today' ? 'Today' : board.yesterday_window.since_label;
    return {
      state: dropTarget === column ? (invalid ? 'invalid' : 'valid') : 'idle',
      message: invalid ? `Already in ${name}` : undefined,
      onDragOver: (event) => {
        if (!invalid) {
          event.preventDefault(); // allows the drop
          event.dataTransfer.dropEffect = 'move';
        } else {
          event.dataTransfer.dropEffect = 'none';
        }
        if (dropTarget !== column) setDropTarget(column);
      },
      onDragLeave: (event) => {
        // Only when leaving the column itself, not moving between its children.
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) setDropTarget(null);
      },
      onDrop: (event) => {
        event.preventDefault();
        const card = dragging;
        setDragging(null);
        setDropTarget(null);
        if (card && !alreadyThere(card, column)) props.onMove(person, card, column);
      },
    };
  };

  const ticketLink = (row: Row, variant: RowVariant): LinkState | undefined =>
    (variant === 'yesterday' || variant === 'today') && continuedTicketIds.has(row.id)
      ? linkFor(`ticket-${row.id}`, variant)
      : undefined;

  const taskLink = (task: StandupTask): LinkState | undefined => {
    const pair = continuedTaskIds.get(task.id);
    if (!pair) return undefined;
    // Both halves share one key: the yesterday task's id.
    return linkFor(`task-${task.section === 'yesterday' ? task.id : pair}`, task.section);
  };

  const actions = {
    readOnly,
    carryForwardLabel: carryDay,
    onTogglePin: (row: Row) => props.onTogglePin(person, row),
    onRemoveToday: (row: Row) => props.onRemoveToday(person, row),
    onRemoveYesterday: (row: Row) => props.onRemoveYesterday(person, row),
    onRemoveBlocker: (row: Row) => props.onRemoveBlockerTicket(person, row),
    onCarryForward: (row: Row) => props.onCarryTicket(person, row),
  };

  const renderGrouped = (rows: Row[], variant: RowVariant) =>
    groupByProject(rows).map(({ projectId, rows: grouped }) => {
      const project = board.projects[String(projectId)];
      return (
        <div key={`${variant}-${projectId}`} role="group" aria-label={project?.name ?? 'Project'}>
          <ProjectGroupHeading name={project?.name ?? 'Unknown project'} projectKey={project?.key} color={project?.color} count={grouped.length} />
          <div className="su-rows">
          {grouped.map((row) => (
            <StandupTicketRow
              key={`${variant}-${row.id}`}
              row={row}
              variant={variant}
              onOpen={onOpen}
              actions={actions}
              plannedIds={plannedIds}
              link={ticketLink(row, variant)}
              todayDate={board.today}
              drag={variant === 'yesterday' || variant === 'today' ? dragFor({ kind: 'ticket', row, from: variant }) : undefined}
            />
          ))}
          </div>
        </div>
      );
    });

  const renderTasks = (tasks: StandupTask[], carryLabel: string) =>
    tasks.length > 0 && (
      <div role="group" aria-label="Adhoc tasks">
        <TaskGroupHeading count={tasks.length} />
        <div className="su-rows">
        {tasks.map((task) => (
          <StandupTaskRow
            key={task.id}
            task={task}
            readOnly={readOnly}
            carryLabel={carryLabel}
            link={taskLink(task)}
            drag={dragFor({ kind: 'task', task, from: task.section })}
            onStatusChange={(t, status) => props.onTaskStatus(person, t, status)}
            onCarryForward={(t) => props.onCarryTask(person, t)}
            onEdit={(t, text) => props.onEditTask(person, t, text)}
            onRemove={(t) => props.onRemoveTask(person, t)}
          />
        ))}
        </div>
      </div>
    );

  const todayRows = showAllToday ? person.today.items : person.today.items.slice(0, TODAY_VISIBLE);
  const yesterdayCount = yesterdayRows.length + person.yesterday.tasks.length;
  const todayCount = person.today.items.length + person.today.tasks.length;
  const blockerCount = person.blockers.length + person.blocker_notes.length;
  const worked = person.counts.worked_on;
  const health = HEALTH_STYLE[person.health];

  return (
    <div key={person.email} className="su-panel" style={{ display: 'flex', flexDirection: 'column', gap: space(2), minWidth: 0 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space(2),
          padding: `${space(2)}px ${space(3)}px`,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: RADIUS.lg,
          boxShadow: SHADOW.card,
        }}
      >
        <Avatar name={person.name} src={person.photo} colorful size={present ? 56 : 44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space(1), flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: present ? 24 : 18, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{person.name}</h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textSubtle }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: health.dot }} />
              {health.label}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: space(1), flexWrap: 'wrap', marginTop: space(0.5) }}>
            <span style={{ fontSize: 13, color: C.textMuted }}>
              {person.counts.completed} done · {worked} worked on {since} · {person.counts.today} today
            </span>
            {!person.has_account && <InsightChip severity="info">Hasn&apos;t joined GRID yet</InsightChip>}
            {board.is_today && !person.can_edit && (
              <InsightChip severity="info">Only {first} can edit this</InsightChip>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space(0.5), flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: C.textMuted, marginRight: space(1), fontVariantNumeric: 'tabular-nums' }} aria-live="polite">
            {position} of {total}
          </span>
          <button type="button" className="su-icon-btn su-icon-btn--bordered" aria-label="Previous person" title="Previous person (K)" onClick={onPrev} disabled={position <= 1}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="su-icon-btn su-icon-btn--bordered" aria-label="Next person" title="Next person (J)" onClick={onNext} disabled={position >= total}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="su-columns">
        <StandupColumn
          id={`yesterday-${person.email}`}
          drop={dropZone('yesterday')}
          title={board.yesterday_window.since_label}
          icon={<History size={16} />}
          count={yesterdayCount}
          footer={
            !readOnly && (
              <div className="su-add-bar">
                <AddTicketPicker
                  target="yesterday"
                  email={person.email}
                  name={first}
                  excludeIds={yesterdayPickerExclude}
                  onPick={(ticket) => props.onAddYesterday(person, ticket)}
                />
                <QuickAddInput
                  triggerLabel="Add Adhoc Task"
                  label={`Adhoc task ${first} worked on ${since}`}
                  placeholder="Describe the adhoc task"
                  maxLength={TASK_TEXT_MAX}
                  emptyError="Describe the task first."
                  failureError="Couldn't save the task. Try again."
                  onAdd={(text) => props.onAddTask(person, 'yesterday', text)}
                />
              </div>
            )
          }
        >
          {yesterdayCount === 0 ? (
            <ColumnEmpty
              icon={<UserX size={20} />}
              title="Nothing added yet"
              hint={readOnly ? undefined : `Add the tickets or adhoc tasks ${first} worked on.`}
            />
          ) : (
            <>
              {renderGrouped(yesterdayRows, 'yesterday')}
              {renderTasks(person.yesterday.tasks, 'today')}
            </>
          )}
        </StandupColumn>

        <StandupColumn
          id={`today-${person.email}`}
          drop={dropZone('today')}
          title={board.is_today ? 'Today' : 'Planned'}
          icon={<CalendarCheck size={16} />}
          count={todayCount}
          footer={
            <div style={{ display: 'flex', flexDirection: 'column', gap: space(1) }}>
              {person.today.items.length > TODAY_VISIBLE && (
                <button type="button" className="su-link-btn" onClick={() => setShowAllToday((value) => !value)}>
                  {showAllToday ? 'Show fewer' : `Show ${person.today.items.length - TODAY_VISIBLE} more`}
                </button>
              )}
              {!readOnly && (
                <div className="su-add-bar">
                  <AddTicketPicker
                    target="today"
                    email={person.email}
                    name={first}
                    excludeIds={todayPickerExclude}
                    onPick={(ticket) => props.onAddToday(person, ticket)}
                  />
                  <QuickAddInput
                    triggerLabel="Add Adhoc Task"
                    label={`Adhoc task for ${first}'s today`}
                    placeholder="Describe the adhoc task"
                    maxLength={TASK_TEXT_MAX}
                    emptyError="Describe the task first."
                    failureError="Couldn't save the task. Try again."
                    onAdd={(text) => props.onAddTask(person, 'today', text)}
                  />
                </div>
              )}
            </div>
          }
        >
          {todayCount === 0 ? (
            <ColumnEmpty
              icon={<Inbox size={20} />}
              title="Nothing planned"
              hint={readOnly ? undefined : 'Add a ticket or a task below.'}
            />
          ) : (
            <>
              {renderGrouped(todayRows, 'today')}
              {renderTasks(person.today.tasks, carryDay)}
            </>
          )}
        </StandupColumn>

        <StandupColumn
          id={`blockers-${person.email}`}
          title="Blockers"
          icon={<AlertOctagon size={16} />}
          count={blockerCount}
          attention={blockerCount > 0}
          footer={
            !readOnly && (
              <div className="su-add-bar">
                <AddTicketPicker
                  target="blockers"
                  email={person.email}
                  name={first}
                  excludeIds={blockerPickerExclude}
                  onPick={(ticket) => props.onAddBlockerTicket(person, ticket)}
                />
                <QuickAddInput
                  triggerLabel="Add Blocker"
                  label={`Blocker for ${first}`}
                  placeholder={`What's blocking ${first}?`}
                  maxLength={BLOCKER_NOTE_MAX}
                  emptyError="Describe the blocker first."
                  failureError="Couldn't save the blocker. Try again."
                  onAdd={(text) => props.onAddBlocker(person, text)}
                />
              </div>
            )
          }
        >
          {blockerCount === 0 ? (
            <ColumnEmpty icon={<CheckCircle2 size={20} color="#22A06B" />} title="No blockers" />
          ) : (
            <>
              {renderGrouped(person.blockers, 'blocker')}
              {person.blocker_notes.length > 0 && (
                <div role="group" aria-label="Blocker notes">
                  {person.blockers.length > 0 && <ProjectGroupHeading name="Notes" count={person.blocker_notes.length} />}
                  <BlockerNotes
                    notes={person.blocker_notes}
                    nameFor={nameFor}
                    readOnly={readOnly}
                    onRemove={(note) => props.onRemoveBlocker(person, note)}
                  />
                </div>
              )}
            </>
          )}
        </StandupColumn>
      </div>
    </div>
  );
}
