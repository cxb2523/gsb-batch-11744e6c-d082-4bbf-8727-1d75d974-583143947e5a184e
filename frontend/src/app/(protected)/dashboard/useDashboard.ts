import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { Summary, SummaryTicket } from './types';
import { greet } from './helpers';

export function useDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<{ id: number; projectId: number } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createProjectId, setCreateProjectId] = useState<number | null>(null);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const data = await apiGet<Summary>('/dashboard/summary');
      setSummary(data);
    } catch (err) {
      console.error('[Dashboard] failed to load summary', err);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTicket = (t: SummaryTicket) => {
    setSelected({ id: t.id, projectId: t.project_id });
  };

  const handleOpenCreate = () => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('selectedProjectId') : null;
    const n = stored ? parseInt(stored, 10) : NaN;
    if (!Number.isNaN(n) && n > 0) {
      setCreateProjectId(n);
      setShowCreate(true);
    } else {
      router.push('/projects');
    }
  };

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const navigate = (path: string) => router.push(path);

  const todayDate = useMemo(() => new Date(), []);
  const greeting = greet();
  const firstName = (user?.name || '').split(' ')[0];

  return {
    loading,
    summary,
    selected,
    setSelected,
    showCreate,
    setShowCreate,
    createProjectId,
    sectionRefs,
    fetchSummary,
    handleOpenTicket,
    handleOpenCreate,
    scrollToSection,
    navigate,
    todayDate,
    greeting,
    firstName,
  };
}
