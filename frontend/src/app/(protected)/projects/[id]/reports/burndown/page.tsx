'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { reportsAPI, BurndownChartData } from '@/lib/api/reports';
import { sprintsAPI, Sprint } from '@/lib/api/sprints';
import BurndownChart from '@/components/reports/BurndownChart';
import ReportFilters from '@/components/reports/ReportFilters';
import ReportExport from '@/components/reports/ReportExport';
import {
  ReportPage,
  ReportHeader,
  ReportCard,
  ReportLegend,
  ReportState,
  StatCard,
  surface,
} from '@/components/reports/ReportLayout';
import { TrendingDown, CalendarDays, Target, Info } from 'lucide-react';
import { tokens } from '@/design-system/tokens';

export default function BurndownReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = Number(params.id);
  const chartRef = useRef<HTMLDivElement>(null);

  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [burndownData, setBurndownData] = useState<BurndownChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch sprints on mount
  useEffect(() => {
    const fetchSprints = async () => {
      try {
        const sprintsData = await sprintsAPI.getSprints(projectId);
        setSprints(sprintsData);
        // Prefer ?sprint= from URL, then active sprint, then most recent
        const sprintParam = searchParams.get('sprint');
        const sprintFromUrl = sprintParam ? sprintsData.find((s) => s.id === parseInt(sprintParam)) : undefined;
        // When several sprints are active, prefer the most recently started one.
        const activeSprint = [...sprintsData]
          .filter((s) => s.state === 'active')
          .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0];
        const defaultSprint = sprintFromUrl || activeSprint || sprintsData[0];
        if (defaultSprint) {
          setSelectedSprintId(defaultSprint.id);
        }
      } catch (err) {
        console.error('Failed to fetch sprints:', err);
        setError('Failed to load sprints');
      }
    };

    fetchSprints();
  }, [projectId, searchParams]);

  // Fetch burndown data when sprint changes
  useEffect(() => {
    if (!selectedSprintId) return;

    const fetchBurndownData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await reportsAPI.getBurndownChart(projectId, selectedSprintId);
        setBurndownData(data);
      } catch (err) {
        console.error('Failed to fetch burndown data:', err);
        // Surface the backend's reason (e.g. "Sprint must have start and end
        // dates") rather than a generic message, so the user knows what to fix.
        setError(err instanceof Error ? err.message : 'Failed to load burndown chart');
      } finally {
        setLoading(false);
      }
    };

    fetchBurndownData();
  }, [projectId, selectedSprintId]);

  const sprintOptions = sprints.map((sprint) => ({
    label: sprint.name,
    value: sprint.id,
  }));

  const exportData = burndownData?.data_points.map((point, index) => ({
    Day: index + 1,
    Date: point.date,
    'Actual Remaining': point.story_points_remaining,
    'Ideal Remaining': point.ideal_remaining,
    'Scope Change': point.scope_change || 0,
  }));

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <ReportPage>
      <ReportHeader
        backHref={`/projects/${projectId}/reports`}
        title="Burndown Chart"
        description="Track daily progress of story points remaining in the sprint"
        actions={
          burndownData ? (
            <ReportExport
              chartRef={chartRef}
              data={exportData}
              filename={`burndown-${burndownData.sprint_name.replace(/\s+/g, '-').toLowerCase()}`}
            />
          ) : undefined
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Filters Sidebar */}
        <div style={{ ...surface, padding: 20, position: 'sticky', top: 24 }}>
          <ReportFilters
            sprints={sprintOptions}
            selectedSprint={selectedSprintId || ''}
            onSprintChange={(id) => setSelectedSprintId(Number(id))}
          />
        </div>

        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Sprint Summary Stats */}
          {burndownData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <StatCard
                icon={Target}
                tone="primary"
                label="Total Story Points"
                value={burndownData.total_story_points}
              />
              <StatCard
                icon={TrendingDown}
                tone="warning"
                label="Current Remaining"
                value={
                  burndownData.data_points[burndownData.data_points.length - 1]?.story_points_remaining || 0
                }
              />
              <StatCard
                icon={CalendarDays}
                tone="success"
                label="Sprint Duration"
                value={`${burndownData.data_points.length} days`}
              />
            </div>
          )}

          {/* Chart */}
          <ReportCard
            ref={chartRef}
            title={burndownData && !loading && !error ? burndownData.sprint_name : undefined}
            subtitle={
              burndownData && !loading && !error
                ? `${formatDate(burndownData.start_date)} – ${formatDate(burndownData.end_date)}`
                : undefined
            }
          >
            {loading && <ReportState spinner title="Loading burndown chart..." />}

            {!loading && error && (
              <ReportState
                icon={Info}
                tone="danger"
                title="Could not load this chart"
                description={error}
              />
            )}

            {!loading && !error && !burndownData && (
              <ReportState
                icon={TrendingDown}
                title="No sprint selected"
                description="Select a sprint from the filters to view the burndown chart"
              />
            )}

            {!loading && !error && burndownData && <BurndownChart data={burndownData} />}
          </ReportCard>

          {/* Chart Insights */}
          {burndownData && (
            <ReportLegend
              icon={Info}
              title="How to read this chart"
              items={[
                <>
                  The <strong style={{ color: tokens.colors.neutral[900] }}>blue line</strong> shows actual
                  story points remaining each day
                </>,
                <>
                  The <strong style={{ color: tokens.colors.neutral[900] }}>grey dashed line</strong> shows
                  the ideal burndown trajectory
                </>,
                <>
                  <strong style={{ color: tokens.colors.warning[700] }}>Orange markers</strong> indicate
                  scope increases (issues added)
                </>,
                <>
                  <strong style={{ color: tokens.colors.success[700] }}>Green markers</strong> indicate
                  scope decreases (issues removed)
                </>,
                <>Actual above ideal means behind schedule; below ideal means ahead of schedule</>,
              ]}
            />
          )}
        </div>
      </div>
    </ReportPage>
  );
}
