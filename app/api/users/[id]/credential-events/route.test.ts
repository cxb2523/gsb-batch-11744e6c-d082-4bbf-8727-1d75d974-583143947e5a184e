import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { drizzle } from 'drizzle-orm/bun-sqlite';

import * as schema from '@/lib/db/schema';

mock.module('next/headers', () => ({
  headers: () => Promise.resolve(new Headers()),
}));

const getSession = mock();
mock.module('@/lib/auth/handler', () => ({
  auth: { api: { getSession } },
}));

const { GET } = await import('./route');
const { createUser, recordCredentialEvent } = await import('@/lib/auth/users');

let sqlite: Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      role TEXT NOT NULL DEFAULT 'viewer',
      provider TEXT NOT NULL DEFAULT 'local',
      oidc_subject TEXT UNIQUE,
      last_login_at INTEGER
    );
    CREATE TABLE credential_event (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      revoked_sessions INTEGER NOT NULL
    );
  `);
  globalThis.__speedtestDb = { sqlite, db };
  getSession.mockResolvedValue({ user: { id: 'admin-id', email: 'admin@x.y', role: 'admin' } });
});

const get = (id: string, query = '') =>
  GET(new Request(`http://x/api/users/${id}/credential-events${query}`), { params: Promise.resolve({ id }) });

describe('GET /api/users/:id/credential-events', () => {
  it('returns events newest first', async () => {
    const u = createUser({ email: 'b@x.y', role: 'viewer', provider: 'local' });
    recordCredentialEvent({ userId: u.id, source: 'admin_reset', actorId: 'admin-id', revokedSessions: 1 });
    recordCredentialEvent({ userId: u.id, source: 'self_change', actorId: u.id, revokedSessions: 2 });
    const res = await get(u.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(2);
    expect(body.events[0].source).toBe('self_change');
    expect(body.events[1].source).toBe('admin_reset');
    expect(body.events[0].revokedSessions).toBe(2);
    expect(typeof body.events[0].createdAt).toBe('number');
  });

  it('returns an empty list when the user has no events', async () => {
    const u = createUser({ email: 'b@x.y', role: 'viewer', provider: 'local' });
    const res = await get(u.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual([]);
  });

  it('respects the limit query parameter', async () => {
    const u = createUser({ email: 'b@x.y', role: 'viewer', provider: 'local' });
    for (let i = 0; i < 5; i++) {
      recordCredentialEvent({ userId: u.id, source: 'admin_reset', actorId: 'admin-id', revokedSessions: i });
    }
    const res = await get(u.id, '?limit=2');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(2);
  });

  it('caps the default limit at 20', async () => {
    const u = createUser({ email: 'b@x.y', role: 'viewer', provider: 'local' });
    for (let i = 0; i < 25; i++) {
      recordCredentialEvent({ userId: u.id, source: 'admin_reset', actorId: 'admin-id', revokedSessions: 0 });
    }
    const res = await get(u.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(20);
  });

  it('rejects out-of-range or non-numeric limits with 400', async () => {
    const u = createUser({ email: 'b@x.y', role: 'viewer', provider: 'local' });
    for (const q of ['?limit=0', '?limit=101', '?limit=abc', '?limit=1.5', '?limit=-3']) {
      const res = await get(u.id, q);
      expect(res.status).toBe(400);
    }
  });

  it('accepts the boundary limits 1 and 100', async () => {
    const u = createUser({ email: 'b@x.y', role: 'viewer', provider: 'local' });
    expect((await get(u.id, '?limit=1')).status).toBe(200);
    expect((await get(u.id, '?limit=100')).status).toBe(200);
  });

  it('returns 404 for an unknown user', async () => {
    const res = await get('no-such-user');
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-admin users', async () => {
    const u = createUser({ email: 'b@x.y', role: 'viewer', provider: 'local' });
    getSession.mockResolvedValue({ user: { id: u.id, email: u.email, role: 'viewer' } });
    const res = await get(u.id);
    expect(res.status).toBe(403);
  });

  it('returns 401 when not signed in', async () => {
    getSession.mockResolvedValue(null);
    const res = await get('any-id');
    expect(res.status).toBe(401);
  });
});
