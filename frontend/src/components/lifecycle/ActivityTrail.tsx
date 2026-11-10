'use client';

import React from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { History } from 'lucide-react';
import type { LifecycleEvent } from '@/lib/api/lifecycle';
import { Avatar } from '@/design-system/components';
import { C, IST_TIME, STATE_STYLE, space } from './tokens';

const FIELD_LABEL: Record<string, string> = {
  state: 'stage',
  owner_email: 'owner',
  target_date: 'target date',
  note: 'notes',
  name: 'name',
  deadline: 'deadline',
  done: 'done',
};

function stateLabel(value: string | null): string {
  if (!value) return 'nothing';
  return STATE_STYLE[value as keyof typeof STATE_STYLE]?.label ?? value;
}

/** One line of plain English for an event, so the trail reads like a story. */
function describe(event: LifecycleEvent): string {
  const stage = event.stage_name ?? 'a stage';
  switch (event.action) {
    case 'stage_moved':
      return `moved ${stage} from ${stateLabel(event.old_value)} to ${stateLabel(event.new_value)}`;
    case 'stage_updated': {
      const field = FIELD_LABEL[event.field ?? ''] ?? event.field ?? 'a field';
      if (!event.new_value) return `cleared the ${field} on ${stage}`;
      return `set the ${field} on ${stage} to ${event.new_value}`;
    }
    case 'flow_updated':
      return 'changed the stages of this project';
    case 'module_added':
      return `added the module ${event.new_value}`;
    case 'module_done':
      return `ticked off ${event.note ?? 'a module'}`;
    case 'module_updated': {
      const field = FIELD_LABEL[event.field ?? ''] ?? event.field ?? 'a field';
      if (event.field === 'done') return `reopened ${event.note ?? 'a module'}`;
      if (!event.new_value) return `cleared the ${field} on ${event.note ?? 'a module'}`;
      return `set the ${field} on ${event.note ?? 'a module'} to ${event.new_value}`;
    }
    case 'module_removed':
      return `removed the module ${event.old_value}`;
    default:
      return 'updated the lifecycle';
  }
}

function dayHeading(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'd MMM yyyy');
}

/** Events in the order they happened, bundled under the day they happened on. */
function groupByDay(events: LifecycleEvent[]): { key: string; heading: string; items: LifecycleEvent[] }[] {
  const groups: { key: string; heading: string; items: LifecycleEvent[] }[] = [];
  for (const event of events) {
    const at = parseISO(event.at);
    const key = format(at, 'yyyy-MM-dd');
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(event);
    else groups.push({ key, heading: dayHeading(at), items: [event] });
  }
  return groups;
}

export function ActivityTrail({ events, loading }: { events: LifecycleEvent[]; loading: boolean }) {
  const groups = groupByDay(events);

  return (
    <section className="lc-card" aria-label="Lifecycle activity">
      <header className="lc-card-head">
        <span aria-hidden style={{ display: 'inline-flex', color: C.textSubtle }}>
          <History size={16} />
        </span>
        <h2 className="lc-card-title" style={{ flex: 1, minWidth: 0 }}>Activity</h2>
      </header>

      <div className="lc-card-body">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space(2) }}>
            {[0, 1, 2].map((row) => (
              <div key={row} style={{ display: 'flex', gap: space(1) }}>
                <div className="lc-skeleton" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="lc-skeleton" style={{ width: '70%', height: 12 }} />
                  <div className="lc-skeleton" style={{ width: '35%', height: 10 }} />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
            Nothing yet. Moving a stage or adding a module is recorded here, with who did it and when.
          </p>
        ) : (
          <div className="lc-scroll">
            {groups.map((group) => (
              <div key={group.key} style={{ marginBottom: space(1) }}>
                <p className="lc-trail-day">{group.heading}</p>
                <ol className="lc-trail lc-trail-group">
                  {group.items.map((event, index) => {
                    const who = event.actor_name ?? event.actor.split('@')[0];
                    const at = parseISO(event.at);
                    return (
                      <li key={`${event.at}-${index}`} className={`lc-trail-item${event.action === 'stage_moved' ? ' is-move' : ''}`}>
                        <div style={{ display: 'flex', gap: space(1), alignItems: 'flex-start' }}>
                          <Avatar name={who} size={22} colorful />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, color: C.textBody, lineHeight: 1.45 }}>
                              <strong style={{ color: C.text, fontWeight: 600 }}>{who}</strong> {describe(event)}
                            </div>
                            {event.action === 'stage_moved' && event.note && (
                              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2, overflowWrap: 'anywhere' }}>“{event.note}”</div>
                            )}
                            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>{IST_TIME.format(at)} IST</div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
