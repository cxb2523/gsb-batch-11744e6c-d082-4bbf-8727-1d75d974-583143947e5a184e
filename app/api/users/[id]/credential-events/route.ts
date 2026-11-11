import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api-errors';
import { requireSession, type SessionUser } from '@/lib/auth/authorize';
import { findUserById, listCredentialEvents } from '@/lib/auth/users';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type Params = { params: Promise<{ id: string }> };

function parseLimit(raw: string | null): number | null {
  if (raw === null) {
    return DEFAULT_LIMIT;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_LIMIT) {
    return null;
  }
  return n;
}

export async function GET(req: Request, { params }: Params) {
  // Map the thrown auth errors to real responses: this route is also covered
  // by the proxy middleware, but defense-in-depth must not leak a 500.
  let caller: SessionUser;
  try {
    caller = await requireSession();
  } catch {
    return apiError('unauthorized', 'You must be signed in.', 401);
  }
  if (caller.role !== 'admin') {
    return apiError('forbidden', 'You do not have permission.', 403);
  }

  const { id } = await params;
  if (!id) {
    return apiError('invalid_id', 'User id is required.', 400);
  }

  const limit = parseLimit(new URL(req.url).searchParams.get('limit'));
  if (limit === null) {
    return apiError('invalid_limit', `Limit must be an integer between 1 and ${MAX_LIMIT}.`, 400);
  }

  const target = findUserById(id);
  if (!target) {
    return apiError('not_found', 'User not found.', 404);
  }

  const events = listCredentialEvents(id, limit).map((e) => ({
    id: e.id,
    userId: e.userId,
    source: e.source,
    actorId: e.actorId,
    createdAt: e.createdAt.getTime(),
    revokedSessions: e.revokedSessions,
  }));
  return NextResponse.json({ events });
}
