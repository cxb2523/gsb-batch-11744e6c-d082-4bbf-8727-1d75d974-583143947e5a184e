'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  TrendingDown,
  BarChart3,
  ArrowRight,
  TrendingUp,
  CalendarRange,
} from 'lucide-react';
import { tokens } from '../../../../../design-system/tokens';
import { ReportPage, StatCard, surface } from '../../../../../components/reports/ReportLayout';
import { sprintsAPI } from '../../../../../lib/api/sprints';
import { reportsAPI } from '../../../../../lib/api/reports';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
}

export default function ReportsPage() {
  const params = useParams();
  const projectId = parseInt(params.id as string);
  // null, not 0: a failed fetch must not report "no active sprints" as if it were
  // an answer. The other two stats already distinguish the two.
  const [activeSprints, setActiveSprints] = useState<number | null>(null);
  const [avgVelocity, setAvgVelocity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const sprints = await sprintsAPI.getSprints(projectId);
        const active = sprints.filter(s => s.state === 'active').length;
        setActiveSprints(active);

        // Fetch velocity data
        try {
          const velocityData = await reportsAPI.getVelocityChart(projectId, 6);
          setAvgVelocity(velocityData.average_velocity);
        } catch (err) {
          console.error('Failed to fetch velocity data:', err);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [projectId]);

  const reports: ReportCard[] = [
    {
      id: 'burndown',
      title: 'Burndown Chart',
      description: 'Track daily sprint progress and story points remaining over time',
      icon: <TrendingDown size={18} />,
      href: `/projects/${projectId}/reports/burndown`,
    },
    {
      id: 'velocity',
      title: 'Velocity Chart',
      description: 'Measure team capacity and predict delivery across sprints',
      icon: <BarChart3 size={18} />,
      href: `/projects/${projectId}/reports/velocity`,
    },
  ];

  return (
    <ReportPage>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: tokens.colors.neutral[900], margin: 0 }}>
          Reports
        </h1>
        <p style={{ fontSize: 14, color: tokens.colors.neutral[600], margin: '6px 0 0' }}>
          Track team performance and project health
        </p>
      </div>

      {/* Quick Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <StatCard
          icon={CalendarRange}
          tone="primary"
          label="Active Sprints"
          value={loading || activeSprints === null ? '—' : activeSprints}
        />
        <StatCard
          icon={TrendingUp}
          tone="success"
          label="Avg Velocity"
          value={loading || avgVelocity === null ? '—' : avgVelocity.toFixed(1)}
        />
      </div>

      {/* Reports Grid */}
      <div>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: tokens.colors.neutral[900],
            margin: '0 0 16px',
          }}
        >
          Available Reports
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {reports.map((report) => (
            <Link key={report.id} href={report.href} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  ...surface,
                  padding: 20,
                  height: '100%',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = tokens.colors.primary[300];
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = tokens.colors.neutral[200];
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Icon */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: tokens.colors.neutral[100],
                      color: tokens.colors.neutral[700],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {report.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: tokens.colors.neutral[900],
                        margin: '0 0 6px',
                      }}
                    >
                      {report.title}
                    </h3>
                    <p
                      style={{
                        fontSize: 13,
                        color: tokens.colors.neutral[600],
                        lineHeight: 1.5,
                        margin: '0 0 12px',
                      }}
                    >
                      {report.description}
                    </p>

                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 13,
                        fontWeight: 500,
                        color: tokens.colors.primary[500],
                      }}
                    >
                      View report
                      <ArrowRight size={14} />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer Note */}
      <div
        style={{
          ...surface,
          marginTop: 32,
          padding: 16,
          background: tokens.colors.neutral[50],
          fontSize: 13,
          color: tokens.colors.neutral[700],
          lineHeight: 1.6,
        }}
      >
        <strong style={{ fontWeight: 600 }}>About reports:</strong> Reports are generated in
        real time from your project's current data, and export as PNG or CSV.
      </div>
    </ReportPage>
  );
}
