'use client';

import { Banner } from '@astryxdesign/core/Banner';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { useCallback, useEffect, useState } from 'react';

import { parseApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';

const DIALOG_TITLE = 'Credential events';

type CredentialEvent = {
  id: string;
  source: 'admin_reset' | 'self_change';
  actorId: string;
  createdAt: number;
  revokedSessions: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; email: string } | null;
};

const SOURCE_LABELS: Record<CredentialEvent['source'], string> = {
  admin_reset: 'Admin reset',
  self_change: 'Self change',
};

export function CredentialEventsDialog({ open, onOpenChange, user }: Props) {
  const [events, setEvents] = useState<CredentialEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (userId: string) => {
    setEvents(null);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/credential-events`);
      if (!res.ok) {
        const err = await parseApiError(res);
        setError(err.message);
        return;
      }
      const body = await res.json();
      setEvents(body.events);
    } catch {
      setError('Could not load credential events.');
    }
  }, []);

  useEffect(() => {
    if (open && user) {
      load(user.id);
    }
  }, [open, user, load]);

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="info" width={520} aria-label={DIALOG_TITLE}>
      <div className="flex flex-col gap-4">
        <DialogHeader title={DIALOG_TITLE} onOpenChange={onOpenChange} />
        <Text type="body" color="secondary">
          {user ? (
            <>
              Recent password changes for <span className="font-medium">{user.email}</span>, newest first.
            </>
          ) : (
            'Recent password changes, newest first.'
          )}
        </Text>
        {error ? <Banner status="error" title={error} /> : null}
        {!error && events === null ? (
          <div className="py-4 text-center text-muted-foreground" role="status">
            Loading credential events…
          </div>
        ) : null}
        {!error && events !== null && events.length === 0 ? (
          <div className="py-4 text-center text-muted-foreground" role="status">
            No credential events recorded for this user yet.
          </div>
        ) : null}
        {!error && events !== null && events.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Token label={SOURCE_LABELS[e.source] ?? e.source} size="sm" />
                  <span className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {e.revokedSessions} {e.revokedSessions === 1 ? 'session' : 'sessions'} revoked
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Dialog>
  );
}
