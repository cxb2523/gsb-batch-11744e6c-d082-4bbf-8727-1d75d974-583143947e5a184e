'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Select, SelectOption } from '@/components/ui';
import { TypeTile } from '@/components/import/issueMeta';
import { PersonTicketOption, PickerSection, standupAPI } from '@/lib/api/standup';
import { C } from './tokens';

type Target = PickerSection;

const COPY: Record<Target, { label: string; ready: (name: string) => string; empty: (name: string) => string }> = {
  today: {
    label: 'Add Ticket',
    ready: (name) => `Add one of ${name}'s tickets to today`,
    empty: (name) => `No other tickets assigned to ${name}`,
  },
  blockers: {
    label: 'Add Ticket',
    ready: (name) => `Add one of ${name}'s tickets that's holding them up`,
    empty: (name) => `No other tickets assigned to ${name}`,
  },
  yesterday: {
    label: 'Add Ticket',
    ready: (name) => `Add a ticket ${name} worked on`,
    empty: (name) => `No other tickets assigned to ${name}`,
  },
};

interface Props {
  target: Target;
  email: string;
  name: string;
  /** Tickets already in the column, left out of the list. */
  excludeIds: Set<number>;
  disabled?: boolean;
  onPick: (option: PersonTicketOption) => void;
}

/** Searchable list of every ticket assigned to the person, across all projects. */
export function AddTicketPicker({ target, email, name, excludeIds, disabled, onPick }: Props) {
  const [tickets, setTickets] = useState<PersonTicketOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const copy = COPY[target];

  useEffect(() => {
    const controller = new AbortController();
    setTickets(null);
    setFailed(false);
    standupAPI
      .searchPersonTickets(email, '', target, controller.signal)
      .then(setTickets)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [email, target]);

  const options: SelectOption<number>[] = useMemo(
    () =>
      (tickets ?? [])
        .filter((ticket) => !excludeIds.has(ticket.id))
        .map((ticket) => ({
          value: ticket.id,
          label: `${ticket.key} · ${ticket.title}`,
          hint: ticket.status_name ?? undefined,
          render: <TypeTile type={ticket.type} size={14} />,
        })),
    [tickets, excludeIds],
  );

  const unavailable = disabled || failed || tickets === null || options.length === 0;
  const reason = disabled
    ? 'Past standups are read-only'
    : failed
      ? "Couldn't load tickets"
      : tickets === null
        ? 'Loading tickets…'
        : options.length === 0
          ? copy.empty(name)
          : copy.ready(name);

  return (
    <div title={reason}>
      <Select<number>
        value={null}
        onChange={(value) => {
          const picked = tickets?.find((ticket) => ticket.id === value);
          if (picked) onPick(picked);
        }}
        options={options}
        placeholder={copy.label}
        ariaLabel={`Add a ticket to ${name}'s ${target === 'blockers' ? 'blockers' : target}`}
        variant="ghost"
        size="sm"
        searchable
        resetAfterSelect
        disabled={unavailable}
        minMenuWidth={360}
        renderTrigger={() => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: unavailable ? C.textDisabled : C.textSubtle, fontWeight: 500, fontSize: 13 }}>
            <Plus size={14} aria-hidden /> {copy.label}
          </span>
        )}
      />
    </div>
  );
}
