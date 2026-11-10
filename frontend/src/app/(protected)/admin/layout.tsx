'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api/client';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    apiGet<User>('/auth/me')
      .then((user) => {
        if (user.role !== 'admin') {
          router.replace('/projects');
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        // Not authenticated — the parent protected layout handles the /login redirect,
        // but we push there ourselves in case this layout mounts before that check.
        router.replace('/login');
      });
  }, [router]);

  if (!ready) return null;

  return <>{children}</>;
}
