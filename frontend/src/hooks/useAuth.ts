import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api/client';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

/**
 * Who is signed in.
 *
 * Ten components call this, and each one used to fetch /auth/me for itself, so
 * a single screen asked the server who you were several times over. The answer
 * is the same for all of them for as long as the page is open, so the request
 * is made once and shared: the first caller starts it, the rest wait on it, and
 * later callers get the stored answer.
 *
 * Deliberately not time-limited. Identity changes only by signing in or out,
 * both of which replace the page, and re-reading it on a timer would reintroduce
 * the traffic this removes. The profile page and the top bar read /auth/me
 * directly rather than through here, so editing your own name is unaffected.
 */

let cached: User | null | undefined;
let inflight: Promise<User | null> | null = null;

async function loadCurrentUser(): Promise<User | null> {
  if (cached !== undefined) return cached;
  if (inflight) return inflight;

  inflight = apiGet<User>('/auth/me')
    .then((user) => {
      cached = user;
      return user;
    })
    .catch(() => {
      // Signed out, or the request failed: both mean "nobody", and both should
      // be answerable again rather than remembered as a null forever.
      cached = undefined;
      return null;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);

  useEffect(() => {
    let active = true;

    loadCurrentUser().then((resolved) => {
      if (!active) return;
      setUser(resolved);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const isAdmin = user?.role === 'admin';
  const isMember = user?.role === 'user' || user?.role === 'member';

  return {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin,
    isMember,
  };
}
