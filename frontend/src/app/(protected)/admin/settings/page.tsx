'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** /admin/settings has no content of its own — Navigation is the landing tab. */
export default function GlobalSettingsIndex() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/settings/navigation');
  }, [router]);

  return null;
}
