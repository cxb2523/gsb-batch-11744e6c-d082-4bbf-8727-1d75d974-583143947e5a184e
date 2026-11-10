'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Self-signup is disabled — accounts are provisioned by an admin (see team management).
 * Any visit to /signup is redirected to the login page so the route is effectively gone.
 */
export default function SignupPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);
  return null;
}
