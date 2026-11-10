'use client';

import React, { useId, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Check, GripVertical, ListChecks, Plus, Trash2 } from 'lucide-react';
import type { LifecycleModule, ModulePatch, ModuleTicket } from '@/lib/api/lifecycle';
import { AssigneePicker, type MemberOption } from './AssigneePicker';
import { TicketPicker } from './TicketPicker';
import { C, CATEGORY_STYLE, RADIUS, VISUALLY_HIDDEN, space } from './tokens';

interface Props {
  modules: LifecycleModule[];
  members: MemberOption[];
  saving: boolean;
  onAdd: (name: string) => Promise<boolean>;
  onChange: (module: LifecycleModule, patch: ModulePatch) => void;
  onRemove: (module: LifecycleModule) => void;
  onReorder: (moduleIds: number[]) => void;
  onLinkTickets: (module: LifecycleModule, ticketIds: number[]) => void;
  /** Opens the module's work: its tickets, their subtasks, and how far along it is. */
  onOpen: (module: LifecycleModule) => void;
  onSearchTickets: (query: string, signal: AbortSignal) => Promise<ModuleTicket[]>;
}

/**
 * The modules a project is split into after scoping, in priority order: name,
 * owner, deadline, done. Drag to reorder.
 */
export function ModuleChecklist({ modules, members, saving, onAdd, onChange, onRemove, onReorder, onLinkTickets, onOpen, onSearchTickets }: Props) {
  const inputId = useId();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  // Which module is being renamed, and what it is being renamed to.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const startRename = (module: LifecycleModule) => {
    setEditingId(module.id);
    setDraft(module.name);
  };

  const commitRename = (module: LifecycleModule) => {
    const value = draft.trim();
    setEditingId(null);
    // An empty name is not a rename, it is a slip: the module keeps the one it had.
    if (value && value !== module.name) onChange(module, { name: value });
  };

  const submit = async () => {
    const value = name.trim();
    if (!value || adding) {
      if (!value) setError('Name the module first.');
      return;
    }
    setAdding(true);
    setError(null);
    setName('');
    const added = await onAdd(value);
    setAdding(false);
    if (!added) {
      setName(value);
      setError("Couldn't add the module. Try again.");
    }
  };

  const drop = (target: LifecycleModule) => {
    if (dragId === null || dragId === target.id) return;
    const ids = modules.map((module) => module.id).filter((id) => id !== dragId);
    ids.splice(modules.findIndex((module) => module.id === target.id), 0, dragId);
    setDragId(null);
    onReorder(ids);
  };

  const done = modules.filter((module) => module.done).length;
  const percent = modules.length ? Math.round((done / modules.length) * 100) : 0;

  return (
    <section className="lc-card" aria-label="Modules">
      <header className="lc-card-head">
        <h2 className="lc-card-title" style={{ flex: 1, minWidth: 0 }}>Modules</h2>
        {modules.length > 0 && (
          <div style={{ width: 132, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textSubtle, textAlign: 'right', marginBottom: 5, fontVariantNumeric: 'tabular-nums' }}>
              {done} of {modules.length} done
            </div>
            <div className="lc-meter" role="img" aria-label={`${percent} percent of modules done`}>
              <span style={{ ['--lc-fill' as string]: modules.length ? done / modules.length : 0 }} />
            </div>
          </div>
        )}
      </header>

      <div className="lc-card-body">
        {modules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: `${space(2)}px 0 ${space(3)}px` }}>
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 42,
                height: 42,
                borderRadius: 13,
                background: C.surfaceSunken,
                color: C.textDisabled,
                marginBottom: space(1),
              }}
            >
              <ListChecks size={20} />
            </span>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>No modules yet</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
              Once the work is scoped, list the modules here so the build is tracked piece by piece.
            </p>
          </div>
        ) : (
          <div className="lc-rows" style={{ marginBottom: space(2) }}>
            {modules.map((module) => (
              <div
                key={module.id}
                className={`lc-row${dragId === module.id ? ' lc-row--dragging' : ''}`}
                // Dragging a row would fight with selecting the text inside it.
                draggable={!saving && editingId !== module.id}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(module.id));
                  setDragId(module.id);
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(event) => dragId !== null && event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  drop(module);
                }}
              >
                <span className="lc-grip" aria-hidden style={{ color: C.textDisabled, paddingTop: 9 }}>
                  <GripVertical size={16} />
                </span>

                <button
                  type="button"
                  className="lc-check"
                  role="checkbox"
                  aria-checked={module.done}
                  aria-label={
                    module.done_from_tickets
                      ? `${module.name}: ${module.tickets_done} of ${module.tickets.length} tickets done`
                      : `${module.name} done`
                  }
                  // Linked tickets are the evidence, so the box only reports them.
                  aria-readonly={module.done_from_tickets}
                  title={module.done_from_tickets ? 'Its tickets decide this. Close them, or unlink them first.' : undefined}
                  disabled={saving || module.done_from_tickets}
                  style={{ marginTop: 7, ...(module.done_from_tickets ? { opacity: 1, cursor: 'default' } : null) }}
                  onClick={() => !module.done_from_tickets && onChange(module, { done: !module.done })}
                >
                  <Check size={13} strokeWidth={3} aria-hidden />
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === module.id ? (
                    <input
                      className="lc-input lc-input--sm"
                      value={draft}
                      maxLength={200}
                      autoFocus
                      aria-label={`Name of ${module.name}`}
                      disabled={saving}
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => commitRename(module)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          commitRename(module);
                        } else if (event.key === 'Escape') {
                          event.stopPropagation();
                          setEditingId(null);   // leaves the name exactly as it was
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="lc-rename"
                      title="Rename"
                      aria-label={`Rename ${module.name}`}
                      disabled={saving}
                      style={{
                        color: module.done ? C.textMuted : C.text,
                        textDecoration: module.done ? 'line-through' : 'none',
                      }}
                      onClick={() => startRename(module)}
                    >
                      {module.name}
                    </button>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space(1), marginTop: 4 }}>
                    <AssigneePicker
                      stageName={module.name}
                      assignees={module.assignees}
                      members={members}
                      disabled={saving}
                      onChange={(emails) => onChange(module, emails.length ? { assignees: emails } : { clear: ['assignees'] })}
                    />
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={VISUALLY_HIDDEN}>Deadline for {module.name}</span>
                      <input
                        type="date"
                        value={module.deadline ?? ''}
                        disabled={saving}
                        onChange={(event) => onChange(module, event.target.value ? { deadline: event.target.value } : { clear: ['deadline'] })}
                        style={{
                          height: 28,
                          padding: '0 6px',
                          border: `1px solid ${module.is_overdue ? C.dangerDot : 'transparent'}`,
                          borderRadius: RADIUS.md,
                          background: module.is_overdue ? C.dangerSoft : 'transparent',
                          color: module.is_overdue ? C.danger : C.textSubtle,
                          font: 'inherit',
                          fontSize: 12,
                          fontWeight: module.is_overdue ? 600 : 400,
                        }}
                      />
                    </label>
                    <TicketPicker
                      moduleName={module.name}
                      linked={module.tickets}
                      disabled={saving}
                      onSearch={onSearchTickets}
                      onChange={(ticketIds) => onLinkTickets(module, ticketIds)}
                    />
                    {module.done_from_tickets ? (
                      <button
                        type="button"
                        className="lc-progress"
                        title={`${module.tickets_done} of ${module.tickets_total} done. Open the work.`}
                        aria-label={`Open ${module.name}: ${module.tickets_done} of ${module.tickets_total} done`}
                        onClick={() => onOpen(module)}
                      >
                        <span className="lc-meter" aria-hidden>
                          <span style={{ ['--lc-fill' as string]: module.tickets_total ? module.tickets_done / module.tickets_total : 0 }} />
                        </span>
                        <span style={{ color: module.done ? '#216E4E' : C.textBody }}>
                          {module.tickets_total ? Math.round((module.tickets_done / module.tickets_total) * 100) : 0}%
                        </span>
                      </button>
                    ) : (
                      module.done && module.done_at && (
                        <span style={{ fontSize: 12, color: C.textMuted }}>Done {format(parseISO(module.done_at), 'd MMM')}</span>
                      )
                    )}
                  </div>

                  {module.tickets.length > 0 && (
                    <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6, margin: `${space(0.75)}px 0 0`, padding: 0 }}>
                      {module.tickets.map((ticket) => {
                        const style = CATEGORY_STYLE[ticket.category];
                        return (
                          <li key={ticket.id}>
                            <span
                              className="lc-ticket-chip"
                              title={`${ticket.key} ${ticket.title} — ${ticket.status}`}
                              style={{ borderColor: style.dot, color: ticket.done ? C.textMuted : C.textBody }}
                            >
                              <span aria-hidden className="lc-ticket-dot" style={{ background: style.dot }} />
                              <span style={{ fontWeight: 700 }}>{ticket.key}</span>
                              <span style={{ textDecoration: ticket.done ? 'line-through' : 'none' }}>{ticket.title}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <span className="lc-row-actions">
                  <button
                    type="button"
                    className="lc-icon-btn"
                    aria-label={`Remove ${module.name}`}
                    title="Remove module"
                    disabled={saving}
                    onClick={() => onRemove(module)}
                  >
                    <Trash2 size={16} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor={inputId} style={VISUALLY_HIDDEN}>Add a module</label>
          <div style={{ display: 'flex', gap: space(1) }}>
            <input
              id={inputId}
              className="lc-input"
              value={name}
              maxLength={200}
              placeholder="Add a module, e.g. User onboarding"
              aria-invalid={Boolean(error)}
              disabled={saving}
              onChange={(event) => {
                setName(event.target.value);
                if (error && event.target.value.trim()) setError(null);
              }}
            />
            <span title={name.trim() ? undefined : 'Name the module first'} style={{ display: 'inline-flex' }}>
              <button type="submit" className="lc-btn" disabled={adding || saving || !name.trim()}>
                <Plus size={16} aria-hidden /> Add
              </button>
            </span>
          </div>
          {error && <div role="alert" style={{ fontSize: 12, color: C.danger, marginTop: 4 }}>{error}</div>}
        </form>
      </div>
    </section>
  );
}
