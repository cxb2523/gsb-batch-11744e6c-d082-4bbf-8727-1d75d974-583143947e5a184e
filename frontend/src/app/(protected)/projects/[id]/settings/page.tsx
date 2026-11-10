'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** /projects/{id}/settings has no content of its own — General is the landing tab. */
export default function ProjectSettingsIndex() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/projects/${params.id}/settings/general`);
  }, [params.id, router]);

  return null;
}
