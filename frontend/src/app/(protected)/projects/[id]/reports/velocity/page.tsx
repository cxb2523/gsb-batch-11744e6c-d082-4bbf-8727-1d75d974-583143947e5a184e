'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { reportsAPI, VelocityChartData } from '@/lib/api/reports';
import VelocityChart from '@/components/reports/VelocityChart';
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
import { TrendingUp, BarChart3, ArrowUp, ArrowDown, Minus, Layers, Info } from 'lucide-react';
import { tokens } from '@/design-system/tokens';

export default function VelocityReportPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const chartRef = useRef<HTMLDivElement>(null);

  const [numSprints, setNumSprints] = useState(6);
  const [velocityData, setVelocityData] = useState<VelocityChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch velocity data
  useEffect(() => {
    const fetchVelocityData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await reportsAPI.getVelocityChart(projectId, numSprints);
        setVelocityData(data);
      } catch (err) {
        console.error('Failed to fetch velocity data:', err);
        // Surface the backend's reason (e.g. the num_sprints range) rather than a
        // generic message, so the user knows what actually went wrong.
        setError(err instanceof Error ? err.message : 'Failed to load velocity chart');
      } finally {
        setLoading(false);
      }
    };

    fetchVelocityData();
  }, [projectId, numSprints]);

  // Calculate trend
  const getTrend = () => {
    if (!velocityData || velocityData.sprints.length < 2) return 'stable';

    const recent = velocityData.sprints.slice(-3);
    const older = velocityData.sprints.slice(-6, -3);

    if (recent.length === 0 || older.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, s) => sum + s.completed, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.completed, 0) / older.length;

    const diff = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (diff > 10) return 'up';
    if (diff < -10) return 'down';
    return 'stable';
  };

  const trend = getTrend();

  const trendDisplay = {
    up: { icon: ArrowUp, label: 'Increasing', color: tokens.colors.success[600], tone: 'success' as const },
    down: { icon: ArrowDown, label: 'Decreasing', color: tokens.colors.error[600], tone: 'danger' as const },
    stable: { icon: Minus, label: 'Stable', color: tokens.colors.neutral[700], tone: 'neutral' as const },
  }[trend];
  const TrendIcon = trendDisplay.icon;

  const exportData = velocityData?.sprints.map((sprint) => ({
    Sprint: sprint.sprint_name,
    Committed: sprint.committed,
    Completed: sprint.completed,
    'Completion %': sprint.committed > 0 ? ((sprint.completed / sprint.committed) * 100).toFixed(1) : '0',
  }));

  return (
    <ReportPage>
      <ReportHeader
        backHref={`/projects/${projectId}/reports`}
        title="Velocity Chart"
        description="Track team velocity across sprints to measure capacity and predict future delivery"
        actions={
          velocityData ? (
            <ReportExport chartRef={chartRef} data={exportData} filename="velocity-chart" />
          ) : undefined
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Filters Sidebar */}
        <div style={{ ...surface, padding: 20, position: 'sticky', top: 24 }}>
          <ReportFilters numSprints={numSprints} onNumSprintsChange={setNumSprints} />
        </div>

        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Summary Stats */}
          {velocityData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <StatCard
                icon={TrendingUp}
                tone="primary"
                label="Average Velocity"
                value={`${velocityData.average_velocity.toFixed(1)} pts`}
              />
              <StatCard
                icon={TrendIcon}
                tone={trendDisplay.tone}
                label="Trend"
                value={<span style={{ color: trendDisplay.color }}>{trendDisplay.label}</span>}
              />
              <StatCard
                icon={Layers}
                tone="purple"
                label="Sprints Analyzed"
                value={velocityData.sprints.length}
              />
            </div>
          )}

          {/* Chart */}
          <ReportCard
            ref={chartRef}
            title={
              !loading && !error && velocityData && velocityData.sprints.length > 0
                ? `Last ${velocityData.sprints.length} Sprints`
                : undefined
            }
            subtitle={
              !loading && !error && velocityData && velocityData.sprints.length > 0
                ? 'Comparing committed vs completed story points'
                : undefined
            }
          >
            {loading && <ReportState spinner title="Loading velocity chart..." />}

            {!loading && error && (
              <ReportState icon={Info} tone="danger" title="Could not load this chart" description={error} />
            )}

            {!loading && !error && (!velocityData || velocityData.sprints.length === 0) && (
              <ReportState
                icon={BarChart3}
                title="No data available"
                description="Adjust filters to view velocity data"
              />
            )}

            {!loading && !error && velocityData && velocityData.sprints.length > 0 && (
              <VelocityChart data={velocityData} />
            )}
          </ReportCard>

          {/* Chart Insights */}
          {velocityData && velocityData.sprints.length > 0 && (
            <ReportLegend
              icon={Info}
              title="How to read this chart"
              items={[
                <>
                  <strong style={{ color: tokens.colors.neutral[900] }}>Grey bars</strong> show story points
                  committed at sprint start
                </>,
                <>
                  <strong style={{ color: tokens.colors.neutral[900] }}>Blue bars</strong> show story points
                  actually completed
                </>,
                <>
                  <strong style={{ color: tokens.colors.warning[700] }}>Orange dashed line</strong> shows
                  average velocity ({velocityData.average_velocity.toFixed(1)} pts)
                </>,
                <>Use average velocity to plan future sprint capacity</>,
                <>Consistent velocity indicates predictable team performance</>,
                <>Large gaps between committed and completed suggest over-commitment</>,
              ]}
            />
          )}
        </div>
      </div>
    </ReportPage>
  );
}
