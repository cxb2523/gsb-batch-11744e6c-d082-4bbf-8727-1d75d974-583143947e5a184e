'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '../lib/api/client';

/**
 * Wraps public auth pages (login, signup, …). If the visitor already has a valid
 * session, it bounces them into the app instead of showing the form — so a logged-in
 * user who types /login in the URL never lands on the login screen.
 *
 * Uses fetch directly rather than apiGet: a 401 here means "not signed in, show the
 * form", not "session expired", so it must NOT trigger the client's global
 * redirect-to-login (which would reload /login in a loop).
 */
export default function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'guest'>('checking');

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (cancelled) return;
        if (res.ok) {
          // Already authenticated — send to the app. replace() so Back doesn't
          // return to the login page.
          router.replace('/dashboard');
        } else {
          setStatus('guest');
        }
      } catch {
        // Backend unreachable: fail open to the form so sign-in stays possible.
        if (!cancelled) setStatus('guest');
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === 'checking') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#f9fafb',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid #e5e7eb',
            borderTopColor: '#155dfc',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
}
