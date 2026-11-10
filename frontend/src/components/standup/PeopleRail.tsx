'use client';

import React from 'react';
import { Avatar } from '@/design-system/components';
import type { StandupPerson } from '@/lib/api/standup';
import { C, HEALTH_STYLE, RADIUS, SHADOW, space } from './tokens';

interface Props {
  people: StandupPerson[];
  selectedEmail: string | null;
  onSelect: (email: string) => void;
}

function railSubline(person: StandupPerson): string {
  const { completed, worked_on, today } = person.counts;
  const parts: string[] = [];
  if (completed) parts.push(`${completed} done`);
  if (worked_on) parts.push(`${worked_on} worked on`);
  parts.push(`${today} today`);
  return parts.join(' · ');
}

/** The list of people, in roster order. Arrow keys move between them. */
export function PeopleRail({ people, selectedEmail, onSelect }: Props) {
  const move = (from: number, delta: number) => {
    const next = Math.min(people.length - 1, Math.max(0, from + delta));
    onSelect(people[next].email);
    requestAnimationFrame(() => document.getElementById(`su-rail-${next}`)?.focus());
  };

  return (
    <nav
      aria-label="People in standup"
      className="su-rail"
      style={{
        alignSelf: 'start',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.card,
        padding: space(1),
      }}
    >
      <div style={{ padding: `${space(0.5)}px ${space(1)}px ${space(1)}px`, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: C.textMuted }}>
        People · {people.length}
      </div>
      <ul role="listbox" aria-label="People" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {people.map((person, index) => {
          const selected = person.email === selectedEmail;
          const health = HEALTH_STYLE[person.health];
          return (
            <li key={person.email} role="presentation">
              <button
                id={`su-rail-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={`su-rail-item${selected ? ' is-selected' : ''}`}
                onClick={() => onSelect(person.email)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') { event.preventDefault(); move(index, 1); }
                  if (event.key === 'ArrowUp') { event.preventDefault(); move(index, -1); }
                }}
              >
                <Avatar name={person.name} src={person.photo} colorful size={28} />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: selected ? 600 : 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {person.name}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {railSubline(person)}
                  </span>
                </span>
                <span
                  role="img"
                  aria-label={health.label}
                  title={health.label}
                  style={{ width: 8, height: 8, borderRadius: '50%', background: health.dot, flexShrink: 0 }}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
